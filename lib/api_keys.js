import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured');
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim();
}

export async function getApiKeyFromRequest(req) {
  const key = getBearerToken(req);
  if (!key) return null;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key', key)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('api_keys lookup error:', error);
    return null;
  }

  return data || null;
}

export function isApiKeyRequired() {
  return process.env.API_KEYS_REQUIRED === 'true';
}
