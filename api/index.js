import { createClient } from '@supabase/supabase-js';
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Resend } from 'resend';

const baseUrl = process.env.BASE_URL || "https://projeto-sass-propaganda.vercel.app";

// ✅ Resend seguro
const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

// ✅ Stripe seguro
const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

function getSupabase() {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

// 🔥 sanitização básica contra XSS
function sanitize(str) {
    return String(str).replace(/[<>]/g, "");
}

// 🔥 reset diário para controle de gastos
function resetDailyIfNeeded(ad) {
    const today = new Date().toISOString().split("T")[0];

    if (ad.last_reset !== today) {
        ad.daily_spent = 0;
        ad.last_reset = today;
    }

    return ad;
}

// 🔥 util
function isAdEligible(ad) {
    if (ad.status !== "active") return false;

    if ((ad.remaining || 0) <= 0) return false;

    if (ad.daily_budget > 0 && ad.daily_spent >= ad.daily_budget) return false;

    return true;
}

const clicks = new Map();

function checkRateLimit(ip) {
    const now = Date.now();

    if (!clicks.has(ip)) {
        clicks.set(ip, []);
    }

    const history = clicks.get(ip);

    // 🔥 remove registros antigos (30s)
    const filtered = history.filter(t => now - t < 30000);

    // 🔥 adiciona novo clique
    filtered.push(now);

    // 🔥 limita tamanho (evita leak de memória)
    if (filtered.length > 20) {
        filtered.shift();
    }

    clicks.set(ip, filtered);

    // 🔥 limite: 5 cliques em 30s
    return filtered.length <= 5;
}

export const config = {
    api: { bodyParser: true },
};

export default async function handler(req, res) {

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.JWT_SECRET) {
        return res.status(500).json({ error: "ENV não configurada" });
    }

    try {

        // ================= BODY =================
        let body = req.body || {};

        if (req.method === "POST" && typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch {
                body = {};
            }
        }

        // ✅ IP corrigido (Vercel manda lista)

        const supabase = getSupabase();
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
            if (!token || !process.env.JWT_SECRET) return null;

            try {
                const payload = jwt.verify(token.trim(), process.env.JWT_SECRET);
                const userId = payload?.sub || payload?.user_id || payload?.id;

                if (!userId) return null;

                const { data } = await supabase
                    .from("users")
                    .select("*")
                    .eq("id", userId)
                    .maybeSingle();

                return data || null;
            } catch (err) {
                return null;
            }
        }

        // ================= REGISTER =================
        if (action === "register") {

            const { name, birthDate, email, password } = body;

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

            // 🔥 FALTAVA ISSO
            const verifyToken = crypto.randomUUID();

            const { error } = await supabase
                .from("users")
                .insert([{
                    name,
                    birth_date: birthDate || null,
                    email,
                    password: hash,
                    token,
                    balance: 0,
                    plan: "free",
                    verify_token: verifyToken,
                    verified: false
                }]);

            if (error) {
                console.error("ERRO SUPABASE:", error);
                return res.status(400).json({ error: error.message });
            }

            if (!resend) {
                return res.status(500).json({ error: "Resend não configurado" });
            }

            await resend.emails.send({
                from: 'onboarding@resend.dev', // 🔥 use esse pra teste
                to: email,
                subject: 'Verifique sua conta',
                html: `
                  <div style="font-family: Arial, sans-serif; background:#0f172a; padding:40px; text-align:center; color:#e2e8f0;">
    
    <div style="max-width:500px; margin:auto; background:#020617; padding:30px; border-radius:12px; border:1px solid #1e293b;">
        
        <h2 style="margin-bottom:10px;">🚀 Confirme seu cadastro</h2>
        
        <p style="color:#94a3b8; font-size:14px;">
            Para ativar sua conta, clique no botão abaixo:
        </p>

        <a href="${baseUrl}/api?action=verify&token=${verifyToken}"
           style="
                display:inline-block;
                margin-top:20px;
                padding:12px 25px;
                background:#3b82f6;
                color:#fff;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
           ">
            ✅ Verificar conta
        </a>

        <p style="margin-top:25px; font-size:12px; color:#64748b;">
            Se o botão não funcionar, copie e cole este link no navegador:
        </p>

        <p style="word-break:break-all; font-size:12px; color:#38bdf8;">
            ${baseUrl}/api?action=verify&token=${verifyToken}
        </p>

        <hr style="margin:25px 0; border-color:#1e293b;">

        <p style="font-size:11px; color:#475569;">
            Se você não criou essa conta, ignore este email.
        </p>

    </div>

</div>
                `
            });

            return res.json({ ok: true });
        }

        // ================= VERIFY =================
        if (action === "verify") {
            const { token } = req.query;

            const { data: user } = await supabase
                .from("users")
                .select("*")
                .eq("verify_token", token)
                .single();

            if (!user) {
                return res.status(400).send("Token inválido");
            }

            await supabase
                .from("users")
                .update({
                    verified: true,
                    verify_token: null
                })
                .eq("id", user.id);

            return res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Conta verificada</title>

<style>
    body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
    }

    .card {
        background: #020617;
        padding: 40px;
        border-radius: 12px;
        text-align: center;
        border: 1px solid #1e293b;
        width: 90%;
        max-width: 400px;
    }

    h1 {
        margin-bottom: 10px;
    }

    p {
        color: #94a3b8;
        font-size: 14px;
    }

    .btn {
        display: inline-block;
        margin-top: 20px;
        padding: 12px 20px;
        background: #22c55e;
        color: #fff;
        text-decoration: none;
        border-radius: 8px;
        font-weight: bold;
    }

    .icon {
        font-size: 50px;
        margin-bottom: 15px;
    }
</style>
</head>

<body>

<div class="card">
    <div class="icon">✅</div>
    <h1>Conta verificada!</h1>

    <p>
        Sua conta foi confirmada com sucesso.<br>
        Agora você já pode acessar a plataforma.
    </p>

    <a href="/" class="btn">Ir para o login</a>
</div>

<script>
    setTimeout(() => {
        window.location.href = "/";
    }, 4000);
</script>

</body>
</html>
`);
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

            if (!user.verified) {
                return res.status(401).json({
                    error: "Verifique seu email antes de acessar"
                });
            }

            // � gera JWT expirável
            const newToken = jwt.sign(
                { sub: user.id },
                process.env.JWT_SECRET,
                { expiresIn: "24h" }
            );

            await supabase
                .from("users")
                .update({ token: newToken })
                .eq("id", user.id);

            return res.json({
                token: newToken,
                user: { id: user.id }
            });
        }

        // ================= REENVIAR VERIFICAÇÃO (API) =================
        if (action === "resend") {

            const { email } = body;

            if (!email) {
                return res.status(400).json({
                    error: "Email é obrigatório"
                });
            }

            // 🔍 busca usuário
            const { data: user } = await supabase
                .from("users")
                .select("*")
                .eq("email", email)
                .maybeSingle();

            // 🔒 não revela se o email existe
            if (!user) {
                return res.json({ ok: true });
            }

            // ✅ já verificado → não faz nada
            if (user.verified) {
                return res.json({ ok: true });
            }

            // 🔥 gera novo token
            const verifyToken = crypto.randomUUID();

            await supabase
                .from("users")
                .update({ verify_token: verifyToken })
                .eq("id", user.id);

            // 📧 envia email novamente
            if (!resend) {
                return res.status(500).json({ error: "Resend não configurado" });
            }

            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: email,
                subject: 'Reenvio de verificação',
                html: `
            <div style="font-family: Arial, sans-serif; background:#0f172a; padding:40px; text-align:center; color:#e2e8f0;">
    
    <div style="max-width:500px; margin:auto; background:#020617; padding:30px; border-radius:12px; border:1px solid #1e293b;">
        
        <h2 style="margin-bottom:10px;">🚀 Confirme seu cadastro</h2>
        
        <p style="color:#94a3b8; font-size:14px;">
            Para ativar sua conta, clique no botão abaixo:
        </p>

        <a href="${baseUrl}/api?action=verify&token=${verifyToken}"
           style="
                display:inline-block;
                margin-top:20px;
                padding:12px 25px;
                background:#3b82f6;
                color:#fff;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
           ">
            ✅ Verificar conta
        </a>

        <p style="margin-top:25px; font-size:12px; color:#64748b;">
            Se o botão não funcionar, copie e cole este link no navegador:
        </p>

        <p style="word-break:break-all; font-size:12px; color:#38bdf8;">
            ${baseUrl}/api?action=verify&token=${verifyToken}
        </p>

        <hr style="margin:25px 0; border-color:#1e293b;">

        <p style="font-size:11px; color:#475569;">
            Se você não criou essa conta, ignore este email.
        </p>

    </div>

</div>
        `
            });

            return res.json({ ok: true });
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

            const { title, description, link, bid, budget } = body;

            // 🔥 normaliza bid
            const bidNumber = Number(
                String(bid).replace(/[^\d.-]/g, "").replace(",", ".")
            );

            // 🔥 normaliza budget
            const budgetNumber = Number(
                String(budget).replace(/[^\d.-]/g, "").replace(",", ".")
            );

            // 🔥 validações
            if (!title || !link || isNaN(bidNumber) || bidNumber <= 0) {
                return res.status(400).json({
                    error: "Dados inválidos",
                    debug: { title, link, bid }
                });
            }

            // 🔥 valida orçamento
            if (isNaN(budgetNumber) || budgetNumber <= 0) {
                return res.status(400).json({ error: "Orçamento inválido" });
            }

            // 🔥 valida saldo para orçamento
            if ((user.balance || 0) < budgetNumber) {
                return res.status(400).json({
                    error: "Saldo insuficiente para orçamento"
                });
            }

            // 🔥 sanitização SEGURA (sem quebrar URL)
            function sanitizeText(text) {
                return String(text)
                    .trim()
                    .replace(/[<>]/g, "") // remove tags básicas
                    .slice(0, 255); // evita overflow
            }

            // 🔥 reset diário para controle de gastos (importante para novos anúncios)
            function resetDailyIfNeeded(ad) {
                const today = new Date().toISOString().split("T")[0];

                if (ad.last_reset !== today) {
                    ad.daily_spent = 0;
                    ad.last_reset = today;
                }

                return ad;
            }

            const safeTitle = sanitizeText(title);
            const safeDescription = sanitizeText(description);

            // 🔥 valida URL corretamente
            let safeLink;
            try {
                const url = new URL(link);
                safeLink = url.href;
            } catch {
                return res.status(400).json({ error: "Link inválido" });
            }

            // 🔥 reserva orçamento imediatamente
            const { error: updateError } = await supabase
                .from("users")
                .update({ balance: (user.balance || 0) - budgetNumber })
                .eq("id", user.id);

            if (updateError) {
                return res.status(400).json({
                    error: "Não foi possível reservar o saldo",
                    details: updateError.message
                });
            }

            console.log("CREATE AD:", {
                user: user.id,
                bid: bidNumber,
                budget: budgetNumber
            });

            const { error } = await supabase
                .from("ads")
                .insert([{
                    user_id: user.id,
                    title: safeTitle,
                    description: safeDescription,
                    link: safeLink,
                    bid: bidNumber,
                    budget: budgetNumber,
                    reserved_budget: budgetNumber,
                    spent: 0,
                    remaining: budgetNumber,
                    daily_budget: budgetNumber / 30,
                    daily_spent: 0,
                    clicks: 0,
                    views: 0,
                    status: "active"
                }]);

            if (error) {
                await supabase
                    .from("users")
                    .update({ balance: user.balance || 0 })
                    .eq("id", user.id);
            }

            if (error) {
                console.error("SUPABASE ERROR:", error);
                return res.status(400).json({
                    error: "Erro ao criar anúncio",
                    details: error.message
                });
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
                .eq("status", "active");

            if (!data) {
                return res.json([]);
            }

            // 🔥 aplica reset + filtro primeiro
            const validAds = data
                .map(ad => resetDailyIfNeeded(ad))
                .filter(ad => isAdEligible(ad));

            // 🔥 depois faz ranking com recência, orçamento e novidade
            const rankedAds = validAds
                .map(ad => {
                    const ctr = ad.views > 0 ? (ad.clicks / ad.views) : 0;
                    const ageHours = ad.created_at
                        ? Math.max((Date.now() - new Date(ad.created_at)) / 3600000, 0)
                        : 0;
                    const recency = Math.max(0, 1 - ageHours / 72);
                    const remainingFactor = Math.min((ad.remaining || 0) / Math.max(ad.budget || 1, 1), 1);
                    const repetitionPenalty = Math.min((ad.views || 0) / 100, 0.25);

                    const score =
                        (ad.bid || 0) * 0.6 +
                        (ctr * 100) * 0.2 +
                        recency * 10 * 0.1 +
                        remainingFactor * 10 * 0.1 -
                        repetitionPenalty;

                    return {
                        ...ad,
                        score
                    };
                })
                .sort((a, b) => b.score - a.score);

            return res.json(rankedAds);
        }

        // ================= CLICK =================
        if (action === "click") {

            const { adId } = body;

            if (!adId) {
                return res.status(400).json({ error: "AdId obrigatório" });
            }

            const ip =
                req.headers["x-forwarded-for"]?.split(",")[0] ||
                req.socket.remoteAddress;

            const allowed = await checkRateLimitDB(supabase, ip, adId);

            if (!allowed) {
                return res.json({ blocked: true });
            }

            await supabase
                .from("click_logs")
                .insert([{ ip, ad_id: adId }]);

            await supabase
                .from("ad_clicks")
                .insert([{ ad_id: adId, ip }]);

            // 🔎 pega anúncio
            const { data: ad } = await supabase
                .from("ads")
                .select("*")
                .eq("id", adId)
                .maybeSingle();

            if (!ad) {
                return res.status(404).json({ error: "Ad não encontrado" });
            }

            // 🔥 RESET DIÁRIO (IMPORTANTE)
            const updatedAd = resetDailyIfNeeded(ad);

            // 🔥 BLOQUEIO DE ORÇAMENTO (AQUI!)
            if (!isAdEligible(updatedAd)) {
                return res.status(400).json({
                    error: "Anúncio pausado ou orçamento atingido"
                });
            }

            if (!ad.user_id) {
                return res.status(400).json({ error: "Anúncio inválido" });
            }

            // valida orçamento do anúncio
            const cost = Number(ad.bid || 0);

            if ((updatedAd.remaining || 0) < cost) {
                await supabase
                    .from("ads")
                    .update({ status: "inactive" })
                    .eq("id", adId);

                return res.status(400).json({ error: "Orçamento do anúncio esgotado" });
            }

            const newRemaining = (updatedAd.remaining || 0) - cost;
            const newSpent = (updatedAd.spent || 0) + cost;
            const newStatus = newRemaining <= 0 ? "inactive" : "active";

            // 📊 atualiza anúncio com orçamento reservado
            await supabase
                .from("ads")
                .update({
                    clicks: (ad.clicks || 0) + 1,
                    spent: newSpent,
                    remaining: newRemaining,
                    daily_spent: (updatedAd.daily_spent || 0) + cost,
                    last_reset: updatedAd.last_reset,
                    status: newStatus
                })
                .eq("id", adId);

            // 🧾 registra transação financeira de clique
            await supabase
                .from("transactions")
                .insert([{
                    user_id: ad.user_id,
                    amount: -cost,
                    type: "click",
                    ad_id: ad.id
                }] );

            return res.json({ success: true });
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

        //
        async function checkRateLimitDB(supabase, ip, adId) {
            try {
                const from = new Date(Date.now() - 60000).toISOString();

                const { data, error } = await supabase
                    .from("click_logs")
                    .select("id")
                    .eq("ip", ip)
                    .eq("ad_id", adId)
                    .gte("created_at", from);

                if (error) {
                    console.error("Erro rate limit:", error);
                    return true; // 🔥 não bloqueia em caso de erro
                }

                const total = data ? data.length : 0;

                // 🔥 limite: 30 cliques em 60s por IP/ad
                return total < 30;

            } catch (err) {
                console.error("Erro inesperado rate limit:", err);
                return true;
            }
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
                    payment_method_types: ["card", "boleto"],
                    mode: "payment",

                    // 🔥 IMPORTANTE PRO WEBHOOK
                    client_reference_id: user.id, // extra para rastreio

                    metadata: {
                        user_id: user.id,
                        amount: amount.toString()
                    },

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

            if (!id || !["active", "paused", "inactive"].includes(status)) {
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

            const updates = { status };

            if (status === "inactive") {
                const refundAmount = Number(ad.remaining || 0);

                if (refundAmount > 0) {
                    await supabase
                        .from("users")
                        .update({ balance: (user.balance || 0) + refundAmount })
                        .eq("id", user.id);

                    await supabase
                        .from("transactions")
                        .insert([{
                            user_id: user.id,
                            amount: refundAmount,
                            type: "refund",
                            ad_id: ad.id
                        }]);

                    updates.remaining = 0;
                }
            }

            await supabase
                .from("ads")
                .update(updates)
                .eq("id", id);

            return res.json({ success: true });
        }

        // ================= DASHBOARD =================
        if (action === "dashboard") {

            const user = await getUserFromToken(extractToken(req));

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            // 📢 anúncios do usuário
            const { data: ads } = await supabase
                .from("ads")
                .select("*")
                .eq("user_id", user.id);

            // 💰 saldo
            const { data: userData } = await supabase
                .from("users")
                .select("balance")
                .eq("id", user.id)
                .maybeSingle();

            // 🧾 total gasto
            const { data: transactions } = await supabase
                .from("transactions")
                .select("amount")
                .eq("user_id", user.id);

            const totalSpent = transactions
                ?.filter(t => t.amount < 0)
                .reduce((acc, t) => acc + Math.abs(t.amount), 0) || 0;

            const totalClicks = ads?.reduce((acc, ad) => acc + (ad.clicks || 0), 0) || 0;
            const totalAds = ads?.length || 0;
            const cpc = totalClicks > 0 ? totalSpent / totalClicks : 0;

            return res.json({
                balance: userData?.balance || 0,
                totalSpent,
                totalClicks,
                totalAds,
                cpc,
                ads
            });
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