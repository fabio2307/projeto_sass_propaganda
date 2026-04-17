import { handleExternalClick } from '../../lib/click_handler.js';
import { getApiKeyFromRequest } from '../../lib/api_keys.js';

export const config = {
  api: { bodyParser: true }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = await getApiKeyFromRequest(req);

    if (process.env.API_KEYS_REQUIRED === 'true' && !apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    return await handleExternalClick({ req, res, apiKey });
  } catch (error) {
    console.error('API /api/v1/click error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
