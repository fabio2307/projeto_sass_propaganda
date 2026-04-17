import { createClient } from '@supabase/supabase-js';
import { checkRateLimitDB, isAdEligible, resetDailyIfNeeded } from './adsService.js';
import { logIntegration } from './integration_logs.js';

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured');
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function parseBody(req) {
  let body = req.body || {};
  if (req.method === 'POST' && typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body;
}

function getIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || 'unknown';
}

export async function handleExternalClick({ req, res, apiKey }) {
  const body = parseBody(req);
  const { adId, referrer } = body || {};

  if (!adId) {
    return res.status(400).json({ error: 'adId is required' });
  }

  const supabase = getSupabase();
  const ip = getIp(req);
  const origin = referrer || req.headers.referer || req.headers.referrer || null;

  const allowed = await checkRateLimitDB(supabase, ip, adId);
  if (!allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const { data: ad } = await supabase
    .from('ads')
    .select('*')
    .eq('id', adId)
    .maybeSingle();

  if (!ad) {
    return res.status(404).json({ error: 'Ad not found' });
  }

  const updatedAd = resetDailyIfNeeded(ad);
  if (!isAdEligible(updatedAd)) {
    return res.status(400).json({ error: 'Ad is not eligible for clicks' });
  }

  const cost = Number(ad.bid || 0);
  if ((updatedAd.remaining || 0) < cost) {
    await supabase
      .from('ads')
      .update({ status: 'inactive' })
      .eq('id', adId);

    return res.status(400).json({ error: 'Ad budget exhausted' });
  }

  const clickPayload = {
    ip,
    ad_id: adId,
    created_at: new Date().toISOString()
  };

  if (origin) clickPayload.origin = origin;
  if (apiKey?.key) clickPayload.api_key = apiKey.key;

  const { error: clickError } = await supabase.from('click_logs').insert([clickPayload]);
  if (clickError) {
    console.warn('click_logs insert fallback:', clickError.message);
    await supabase.from('click_logs').insert([{ ip, ad_id: adId, created_at: new Date().toISOString() }]);
  }

  const newRemaining = (updatedAd.remaining || 0) - cost;
  const newSpent = (updatedAd.spent || 0) + cost;
  const newDailySpent = (updatedAd.daily_spent || 0) + cost;
  const newStatus = newRemaining <= 0 ? 'inactive' : 'active';

  await supabase.from('ads').update({
    clicks: (ad.clicks || 0) + 1,
    spent: newSpent,
    remaining: newRemaining,
    daily_spent: newDailySpent,
    last_reset: updatedAd.last_reset,
    status: newStatus
  }).eq('id', adId);

  await supabase.from('transactions').insert([{
    user_id: ad.user_id,
    amount: -cost,
    type: 'click',
    reference_id: ad.id,
    description: `External click: ${ad.title}`
  }]);

  await logIntegration(apiKey?.key || null, '/api/v1/click');

  return res.json({ success: true });
}
