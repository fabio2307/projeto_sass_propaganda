import { createClient } from '@supabase/supabase-js';
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import crypto from "crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {

    const { action } = req.query;

    function extractToken(req) {
        const authHeader =
            req.headers.authorization ||
            req.headers.Authorization ||
            "";

        console.log("AUTH HEADER:", authHeader);

        if (!authHeader.startsWith("Bearer ")) return null;

        return authHeader.split(" ")[1];
    }

    async function getUserFromToken(token) {
        if (!token) {
            console.log("❌ TOKEN VAZIO");
            return null;
        }

        const cleanToken = token.trim();

        console.log("🔍 TOKEN RECEBIDO:", cleanToken);

        const { data, error } = await supabase
            .from("users")
            .select("*")
            .eq("token", cleanToken)
            .single();

        if (error) {
            console.error("❌ ERRO TOKEN:", error);
            return null;
        }

        console.log("✅ USER:", data?.id);

        return data;
    }

    try {

        // ================= REGISTER =================
        if (action === "register") {

            const { name, age, email, password } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({ error: "Dados inválidos" });
            }

            const { data: existingUser } = await supabase
                .from("users")
                .select("id")
                .eq("email", email)
                .maybeSingle();

            if (existingUser) {
                return res.status(400).json({ error: "Email já cadastrado" });
            }

            const hash = await bcrypt.hash(password, 10);
            const token = crypto.randomUUID();

            const { error } = await supabase
                .from("users")
                .insert([{
                    name,
                    age: age || null,
                    email,
                    password: hash,
                    token,
                    balance: 0,
                    plan: "free"
                }]);

            if (error) {
                console.error(error);
                return res.status(400).json({ error: "Erro ao criar conta" });
            }

            return res.json({ ok: true }); // 🔥 não loga mais automaticamente
        }

        // ================= LOGIN =================
        if (action === "login") {

            const { email, password } = req.body;

            const { data: user } = await supabase
                .from("users")
                .select("*")
                .eq("email", email)
                .maybeSingle();

            if (!user) {
                return res.status(401).json({ error: "Login inválido" });
            }

            const match = await bcrypt.compare(password, user.password);

            if (!match) {
                return res.status(401).json({ error: "Login inválido" });
            }

            console.log("✅ LOGIN OK, TOKEN:", user.token);

            return res.json({
                token: user.token
            });
        }

        // ================= GET USER =================
        if (action === "getUser") {

            const token = extractToken(req);

            const user = await getUserFromToken(token);

            console.log("TOKEN RECEBIDO:", token);

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            return res.json({
                balance: user.balance,
                plan: user.plan
            });
        }

        // ================= CREATE AD =================
        if (action === "createAd") {

            const token = extractToken(req);
            const user = await getUserFromToken(token);

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { title, description, link, bid } = req.body;

            if (!title || !link || bid === undefined || bid === null || bid <= 0) {
                return res.status(400).json({ error: "Dados inválidos" });
            }

            const { error } = await supabase
                .from("ads")
                .insert([{
                    user_id: user.id,
                    title,
                    description,
                    link,
                    bid,
                    clicks: 0,
                    views: 0
                }]);

            if (error) {
                console.error(error);
                return res.status(400).json({ error: "Erro ao criar anúncio" });
            }

            return res.json({ success: true });
        }

        // ================= MY ADS =================
        if (action === "myAds") {

            const token = extractToken(req);
            const user = await getUserFromToken(token);

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { data } = await supabase
                .from("ads")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });

            return res.json(data);
        }


        // ================= CLICK AD =================
        if (action === "click") {

            const { adId } = req.body;

            if (!adId) {
                return res.status(400).json({ error: "Ad inválido" });
            }

            const { data: ad } = await supabase
                .from("ads")
                .select("*")
                .eq("id", adId)
                .single();

            if (!ad) {
                return res.status(404).json({ error: "Ad não encontrado" });
            }

            const { data: user } = await supabase
                .from("users")
                .select("*")
                .eq("id", ad.user_id)
                .single();

            // 🔥 AQUI ENTRA A REGRA
            if (!user || user.balance < ad.bid) {
                return res.json({ paused: true });
            }

            // atualiza clique
            await supabase
                .from("ads")
                .update({ clicks: ad.clicks + 1 })
                .eq("id", adId);

            // desconta saldo
            await supabase
                .from("users")
                .update({ balance: user.balance - ad.bid })
                .eq("id", user.id);

            return res.json({ ok: true });
        }

        // ================= VIEW AD =================
        if (action === "view") {

            const { adId } = req.body;

            const { data: ad } = await supabase
                .from("ads")
                .select("views")
                .eq("id", adId)
                .single();

            await supabase
                .from("ads")
                .update({ views: ad.views + 1 })
                .eq("id", adId);

            return res.json({ ok: true });
        }

        // ================= LIST ADS =================
        if (action === "listAds") {

            const { data } = await supabase
                .from("ads")
                .select("*")
                .order("score", { ascending: false });

            return res.json(data);
        }

        // ================= CREATE CHECKOUT =================
        if (action === "createCheckout") {

            const token = extractToken(req);
            const user = await getUserFromToken(token);

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { amount } = req.body;

            if (!amount || amount <= 0) {
                return res.status(400).json({ error: "Valor inválido" });
            }

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                mode: "payment",
                line_items: [{
                    price_data: {
                        currency: "brl",
                        product_data: { name: "Adicionar saldo" },
                        unit_amount: Math.round(amount * 100)
                    },
                    quantity: 1
                }],
                success_url: `${process.env.BASE_URL}?success=true`,
                cancel_url: `${process.env.BASE_URL}?cancel=true`,
                metadata: {
                    user_id: user.id,
                    amount: String(amount)
                }
            });

            return res.json({ url: session.url });
        }

        return res.status(400).json({ error: "Ação inválida" });

    } catch (err) {
        console.error("ERRO:", err);
        return res.status(500).json({ error: "Erro interno" });
    }
}