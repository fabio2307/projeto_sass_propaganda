import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

    const { data, error } = await supabase.auth.signUp({
        email,
        password
    });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    res.json({
        user: data.user,
        token: data.session?.access_token
    });
}

async function login(req, res) {

    const { email, password } = req.body;

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
}

// ================= USER =================

async function getUser(req, res) {

    const token = req.headers.authorization?.replace("Bearer ", "");

    const supabase = getSupabase(token);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return res.status(401).json({ error: "Usuário inválido" });
    }

    const { data, error } = await supabase
        .from("users")
        .select("balance")
        .eq("id", user.id)
        .single();

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json(data);
}

// ================= ADS =================

async function createAd(req, res) {

    const token = req.headers.authorization?.replace("Bearer ", "");

    const supabase = getSupabase(token);

    const { title, description, link, bid } = req.body;

    if (!title || !link || !bid) {
        return res.status(400).json({ error: "Campos obrigatórios" });
    }

    const {
        data: { user }
    } = await supabase.auth.getUser();

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

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ ok: true, ad: data });
}

async function myAds(req, res) {

    const token = req.headers.authorization?.replace("Bearer ", "");

    const supabase = getSupabase(token);

    const { data, error } = await supabase
        .from("ads")
        .select("*");

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json(data);
}

// ================= CLICK =================

async function clickAd(req, res) {

    const token = req.headers.authorization?.replace("Bearer ", "");
    const supabase = getSupabase(token);

    const { ad_id } = req.body;

    const { data: { user } } = await supabase.auth.getUser();

    const { data: ad } = await supabase
        .from("ads")
        .select("*")
        .eq("id", ad_id)
        .single();

    if (ad.user_id === user.id) {
        return res.status(400).json({ error: "Ação inválida" });
    }

    const { data: dono } = await supabase
        .from("users")
        .select("balance")
        .eq("id", ad.user_id)
        .single();

    if (dono.balance < ad.bid) {
        return res.status(400).json({ error: "Saldo insuficiente" });
    }

    await supabase
        .from("users")
        .update({ balance: dono.balance - ad.bid })
        .eq("id", ad.user_id);

    await supabase
        .from("ads")
        .update({ clicks: ad.clicks + 1 })
        .eq("id", ad_id);

    await supabase.from("transactions").insert({
        user_id: ad.user_id,
        amount: -ad.bid,
        type: "click"
    });

    res.json({ success: true });
}

// ================= PAGAMENTO =================

async function createCheckout(req, res) {

    const token = req.headers.authorization?.replace("Bearer ", "");

    const { amount } = req.body;

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

        // 🔥 IMPORTANTE
        metadata: {
            user_id: token
        },

        success_url: process.env.BASE_URL,
        cancel_url: process.env.BASE_URL,
    });

    res.json({ url: session.url });
}