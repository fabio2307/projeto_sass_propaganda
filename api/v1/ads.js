import { fetchPublicAds } from '../../lib/ads_public.js';
import { getApiKeyFromRequest } from '../../lib/api_keys.js';
import { logIntegration } from '../../lib/integration_logs.js';

export const config = {
  api: { bodyParser: true }
};

function setCors(req, res) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'https://yourdomain.com'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = await getApiKeyFromRequest(req);

    if (process.env.API_KEYS_REQUIRED === 'true' && !apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const limit = req.query.limit;
    const category = req.query.category;

    const ads = await fetchPublicAds({ limit, category });

    await logIntegration(apiKey?.key || null, '/api/v1/ads');

    return res.json(ads);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
