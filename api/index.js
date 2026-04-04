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

    try {

        const action = req.query.action;

        // ================= LOGIN =================
        if (action === "login") {

            const body = req.body || {};
            const { email, password } = body;

            if (!email || !password) {
                return res.status(400).json({ error: "Dados inválidos" });
            }

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

        // ================= REGISTER =================
        if (action === "register") {

            const { email, password } = req.body || {};

            const supabase = getSupabase();

            const { error } = await supabase.auth.signUp({ email, password });

            if (error) return res.status(400).json({ error: error.message });

            return res.json({ ok: true });
        }

        // ================= GET USER =================
        if (action === "getUser") {

            const token = req.headers.authorization?.replace("Bearer ", "");
            const supabase = getSupabase(token);

            const { data: { user } } = await supabase.auth.getUser();

            if (!user) return res.status(401).json({ error: "Não autorizado" });

            const { data } = await supabase
                .from("users")
                .select("balance")
                .eq("id", user.id)
                .single();

            return res.json(data);
        }

        // ================= CREATE CHECKOUT =================
        if (action === "createCheckout") {

            if (!stripe) {
                return res.status(500).json({ error: "Stripe não configurado" });
            }

            const token = req.headers.authorization?.replace("Bearer ", "");
            const supabase = getSupabase(token);

            const { data: { user } } = await supabase.auth.getUser();

            const { amount } = req.body || {};

            if (!amount || amount <= 0) {
                return res.status(400).json({ error: "Valor inválido" });
            }

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'brl',
                        product_data: { name: 'Saldo Ads' },
                        unit_amount: amount * 100,
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                metadata: { user_id: user.id },
                success_url: process.env.BASE_URL,
                cancel_url: process.env.BASE_URL,
            });

            return res.json({ url: session.url });
        }

        return res.status(400).json({ error: "Ação inválida" });

    } catch (err) {
        console.error("ERRO GERAL:", err);
        return res.status(500).json({ error: "Erro interno" });
    }
}