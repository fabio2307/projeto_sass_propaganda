import { createClient } from '@supabase/supabase-js';
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import crypto from "crypto";
//import { checkRateLimit } from "../lib/rateLimit";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        return res.status(500).json({
            error: "ENV não configurada"
        });
    }

    try {

        console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
        console.log("SUPABASE_KEY:", process.env.SUPABASE_ANON_KEY ? "OK" : "MISSING");

        // ✅ BODY PARSER MANUAL (AGORA NO LUGAR CERTO)
        let body = req.body;

        if (!body && req.method === "POST") {
            const buffers = [];

            for await (const chunk of req) {
                buffers.push(chunk);
            }

            const raw = Buffer.concat(buffers).toString();

            try {
                body = raw ? JSON.parse(raw) : {};
            } catch {
                body = {};
            }
        }

        const ip = req.headers["x-forwarded-for"] || "unknown";

       /* if (!checkRateLimit(ip)) {
            return res.status(429).json({ error: "Muitos cliques" });
        }*/

        const { action } = req.query;

        function extractToken(req) {
            const authHeader =
                req.headers.authorization ||
                req.headers.Authorization ||
                "";

            if (!authHeader.startsWith("Bearer ")) return null;

            return authHeader.split(" ")[1];
        }

        async function getUserFromToken(token) {
            if (!token) return null;

            const { data, error } = await supabase
                .from("users")
                .select("*")
                .eq("token", token.trim())
                .single();

            if (error || !data) return null;

            return data;
        }



        // ================= REGISTER =================
        if (action === "register") {

            const { name, age, email, password } = body;

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
                return res.status(400).json({ error: "Erro ao criar conta" });
            }

            return res.json({ ok: true });
        }

        // ================= LOGIN =================
        if (action === "login") {

            const { email, password } = body;

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

            const { title, description, link, bid } = body;

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
                    views: 0,
                    status: "active"
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

        // ================= OPTIMIZE ADS =================
        if (action === "webhook") {
            const sig = req.headers["stripe-signature"];

            let event;

            try {
                event = stripe.webhooks.constructEvent(
                    req.rawBody,
                    sig,
                    process.env.STRIPE_WEBHOOK_SECRET
                );
            } catch (err) {
                return res.status(400).send(`Webhook Error: ${err.message}`);
            }

            if (event.type === "checkout.session.completed") {

                const session = event.data.object;

                const userId = session.metadata.user_id;
                const amount = Number(session.metadata.amount);

                const { data: user } = await supabase
                    .from("users")
                    .select("balance")
                    .eq("id", userId)
                    .single();

                await supabase
                    .from("users")
                    .update({
                        balance: user.balance + amount
                    })
                    .eq("id", userId);

                await supabase
                    .from("transactions")
                    .insert([{
                        user_id: userId,
                        amount,
                        type: "deposit"
                    }]);
            }

            return res.json({ received: true });
        }

        // ================= CLICK AD =================
        if (action === "click") {

            const { adId } = body;

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

                await supabase
                    .from("ads")
                    .update({ status: "paused" })
                    .eq("id", ad.id);

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

            const { adId } = body;

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
                .eq("status", "active")
                .order("score", { ascending: false });

            return res.json(data);
        }

        // ================= TRANSACTIONS =================
        if (action === "transactions") {

            const token = extractToken(req);
            const user = await getUserFromToken(token);

            const { data } = await supabase
                .from("transactions")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });

            return res.json(data);
        }

        // ================= TOGGLE AD =================
        if (action === "toggleAd") {

            const token = extractToken(req);
            const user = await getUserFromToken(token);

            const { id, status } = body;

            await supabase
                .from("ads")
                .update({ status })
                .eq("id", id)
                .eq("user_id", user.id);

            return res.json({ ok: true });
        }

        // ================= CREATE CHECKOUT =================
        if (action === "createCheckout") {

            const token = extractToken(req);
            const user = await getUserFromToken(token);

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { amount } = body;

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
        console.error("ERRO REAL:", err);

        return res.status(500).json({
            error: "Erro interno",
            detalhe: err.message
        });
    }
}