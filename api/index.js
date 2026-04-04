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

export default async function handler(req, res) {

    const action = req.query.action;

    try {

        if (action === "login") {

            const { email, password } = req.body || {};

            const supabase = getSupabase();

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) return res.status(400).json({ error: error.message });

            return res.json({
                token: data.session.access_token
            });
        }

        if (action === "register") {

            const { email, password } = req.body;

            const supabase = getSupabase();

            const { data, error } = await supabase.auth.signUp({
                email,
                password
            });

            if (error) return res.status(400).json({ error: error.message });

            return res.json({ ok: true });
        }

        return res.status(400).json({ error: "Ação inválida" });

    } catch (err) {
        console.error("ERRO API:", err);
        res.status(500).json({ error: "Erro interno" });
    }
}