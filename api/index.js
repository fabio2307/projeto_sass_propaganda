import { createClient } from '@supabase/supabase-js';
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import crypto from "crypto";

// ✅ Stripe seguro
const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

// ✅ Rate limit
const clicks = new Map();

function checkRateLimit(ip) {
    const now = Date.now();

    if (!clicks.has(ip)) {
        clicks.set(ip, []);
    }

    const history = clicks.get(ip);
    const filtered = history.filter(t => now - t < 30000);

    filtered.push(now);
    clicks.set(ip, filtered);

    return filtered.length <= 5;
}

export default async function handler(req, res) {

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        return res.status(500).json({ error: "ENV não configurada" });
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );

    try {

        // ================= BODY =================
        let body = req.body;

        if (!body && req.method === "POST") {
            const buffers = [];
            for await (const chunk of req) buffers.push(chunk);

            const raw = Buffer.concat(buffers).toString();

            try {
                body = raw ? JSON.parse(raw) : {};
            } catch {
                body = {};
            }
        }

        // ✅ IP corrigido (Vercel manda lista)

        const { action } = req.query;

        // ✅ IP corrigido
        const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown";

        // ✅ rate limit só em ações específicas
        if (action === "click" || action === "createAd") {
            if (!checkRateLimit(ip)) {
                return res.status(429).json({ error: "Muitos cliques" });
            }
        }

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

            const { data } = await supabase
                .from("users")
                .select("*")
                .eq("token", token.trim())
                .maybeSingle();

            return data || null;
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
                token: user.token,
                user: { id: user.id } // 🔥 importante pro frontend
            });
        }

        // ================= GET USER =================
        if (action === "getUser") {

            const user = await getUserFromToken(extractToken(req));

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

            const user = await getUserFromToken(extractToken(req));

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { title, description, link, bid } = body;

            if (!title || !link || !bid || bid <= 0) {
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
                return res.status(400).json({ error: "Erro ao criar anúncio" });
            }

            return res.json({ success: true });
        }

        // ================= MY ADS =================
        if (action === "myAds") {

            const user = await getUserFromToken(extractToken(req));

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

        // ================= LIST ADS =================
        if (action === "listAds") {

            const { data } = await supabase
                .from("ads")
                .select("*")
                .eq("status", "active")
                .order("created_at", { ascending: false });

            return res.json(data);
        }

        // ================= CLICK =================
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

            if (!user || user.balance < ad.bid) {

                await supabase
                    .from("ads")
                    .update({ status: "paused" })
                    .eq("id", ad.id);

                return res.json({ paused: true });
            }

            await supabase
                .from("ads")
                .update({ clicks: ad.clicks + 1 })
                .eq("id", adId);

            await supabase
                .from("users")
                .update({ balance: user.balance - ad.bid })
                .eq("id", user.id);

            return res.json({ ok: true });
        }

        // ================= VIEW =================
        if (action === "view") {

            const { adId } = body;

            if (!adId) return res.json({ ok: true });

            const { data: ad } = await supabase
                .from("ads")
                .select("views")
                .eq("id", adId)
                .maybeSingle();

            if (!ad) return res.json({ ok: true });

            await supabase
                .from("ads")
                .update({ views: ad.views + 1 })
                .eq("id", adId);

            return res.json({ ok: true });
        }

        // ================= CHECKOUT =================
        if (action === "createCheckout") {

            if (!stripe) {
                return res.status(500).json({ error: "Stripe não configurado" });
            }

            const user = await getUserFromToken(extractToken(req));

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { amount } = body;

            if (!amount || amount <= 0) {
                return res.status(400).json({ error: "Valor inválido" });
            }

            try {

                const baseUrl = req.headers.origin || "https://projeto-sass-propaganda.vercel.app";

                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ["card", "boleto"], // ✅ aqui está o ajuste
                    mode: "payment",
                    line_items: [{
                        price_data: {
                            currency: "brl",
                            product_data: {
                                name: "Adicionar saldo"
                            },
                            unit_amount: Math.round(amount * 100)
                        },
                        quantity: 1
                    }],
                    success_url: `${baseUrl}/?success=true`,
                    cancel_url: `${baseUrl}/?cancel=true`
                });

                return res.json({ url: session.url });

            } catch (err) {
                console.error("🔥 ERRO STRIPE:", err);

                return res.status(500).json({
                    error: "Erro ao criar pagamento",
                    detalhe: err.message
                });
            }
        }

        // ================= TOGGLE (CORRIGIDO) =================
        if (action === "toggleAd") {

            const user = await getUserFromToken(extractToken(req));

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { id, status } = body;

            if (!id || !["active", "paused"].includes(status)) {
                return res.status(400).json({ error: "Dados inválidos" });
            }

            const { data: ad } = await supabase
                .from("ads")
                .select("*")
                .eq("id", id)
                .maybeSingle();

            if (!ad) {
                return res.status(404).json({ error: "Anúncio não encontrado" });
            }

            if (ad.user_id !== user.id) {
                return res.status(403).json({ error: "Sem permissão" });
            }

            await supabase
                .from("ads")
                .update({ status })
                .eq("id", id);

            return res.json({ success: true });
        }

        return res.status(400).json({ error: "Ação inválida" });

    } catch (err) {
        console.error("🔥 ERRO REAL:", err);

        return res.status(500).json({
            error: "Erro interno",
            detalhe: err.message // 👈 ajuda MUITO
        });
    }
}