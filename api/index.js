import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

// ================= HELPER =================

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

// ================= HANDLER =================

export default async function handler(req, res) {

    const action = req.query.action;

    try {

        switch (action) {

            case "register":
                return register(req, res);

            case "login":
                return login(req, res);

            case "getUser":
                return getUser(req, res);

            case "createAd":
                return createAd(req, res);

            case "myAds":
                return myAds(req, res);

            case "clickAd":
                return clickAd(req, res);

            case "createCheckout":
                return createCheckout(req, res);

            default:
                return res.status(400).json({ error: "Ação inválida" });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro interno" });
    }
}

// ================= AUTH =================

async function register(req, res) {

    const { email, password } = req.body;

    const supabase = getSupabase();

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) return res.status(400).json({ error: error.message });

    res.json({
        user: data.user,
        token: data.session?.access_token
    });
}

async function login(req, res) {

    try {

        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({ error: "Dados inválidos" });
        }

        const supabase = getSupabase();

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.json({
            user: data.user,
            token: data.session.access_token
        });

    } catch (err) {
        console.error("ERRO LOGIN:", err);
        res.status(500).json({ error: "Erro no login" });
    }
}

// ================= USER =================

async function getUser(req, res) {

    const token = req.headers.authorization?.replace("Bearer ", "");
    const supabase = getSupabase(token);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return res.status(401).json({ error: "Usuário inválido" });

    const { data } = await supabase
        .from("users")
        .select("balance")
        .eq("id", user.id)
        .single();

    res.json(data);
}

// ================= ADS =================

async function createAd(req, res) {

    const token = req.headers.authorization?.replace("Bearer ", "");
    const supabase = getSupabase(token);

    const { title, description, link, bid } = req.body;

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from("ads")
        .insert([{
            title,
            description,
            link,
            bid: Number(bid),
            user_id: user.id,
            views: 0,
            clicks: 0
        }])
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, ad: data });
}

async function myAds(req, res) {

    const token = req.headers.authorization?.replace("Bearer ", "");
    const supabase = getSupabase(token);

    const { data } = await supabase
        .from("ads")
        .select("*");

    res.json(data);
}

// ================= PAGAMENTO =================

async function createCheckout(req, res) {

    const token = req.headers.authorization?.replace("Bearer ", "");
    const supabase = getSupabase(token);

    const { data: { user } } = await supabase.auth.getUser();

    const { amount } = req.body;

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

        // ✅ CORRETO
        metadata: {
            user_id: user.id
        },

        success_url: process.env.BASE_URL,
        cancel_url: process.env.BASE_URL,
    });

    res.json({ url: session.url });
}