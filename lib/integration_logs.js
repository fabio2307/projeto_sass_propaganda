import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured');
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function logIntegration(apiKey, endpoint) {
  try {
    const supabase = getSupabase();
    await supabase.from('integration_logs').insert([{
      api_key: apiKey || null,
      endpoint,
      created_at: new Date().toISOString()
    }]);
  } catch (error) {
    console.error('integration_logs error:', error);
  }
}
