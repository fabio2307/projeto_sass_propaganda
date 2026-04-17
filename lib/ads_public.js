import { createClient } from '@supabase/supabase-js';
import { isAdEligible, calculateAdScore, resetDailyIfNeeded } from './adsService.js';

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured');
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function parseLimit(limit) {
  const parsed = Number(limit);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, 50);
  }
  return 5;
}

function transformAd(ad) {
  return {
    id: ad.id,
    title: ad.title,
    description: ad.description,
    link: ad.link,
    bid: Number(ad.bid || 0)
  };
}

export async function fetchPublicAds({ limit, category }) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ads')
    .select('*')
    .eq('status', 'active');

  if (error) {
    console.error('fetchPublicAds error:', error);
    return [];
  }

  const activeAds = (data || [])
    .map(ad => resetDailyIfNeeded(ad))
    .filter(isAdEligible);

  let filteredAds = activeAds;
  const requestedCategory = String(category || '').trim().toLowerCase();

  if (requestedCategory) {
    const categoryMatches = activeAds.filter(ad =>
      String(ad.category || '').trim().toLowerCase() === requestedCategory
    );
    if (categoryMatches.length > 0) {
      filteredAds = categoryMatches;
    }
  }

  const rankedAds = filteredAds
    .map(ad => ({ ...ad, score: calculateAdScore(ad) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, parseLimit(limit));

  return rankedAds.map(transformAd);
}
