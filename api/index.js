import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

function getSupabase(token) {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        token
            ? {
                global: {
                    headers: { Authorization: `Bearer ${token}` }
                }
            }
            : {}
    );
}

export default function handler(req, res) {
    return res.json({
        ok: true,
        message: "API funcionando"
    });
}