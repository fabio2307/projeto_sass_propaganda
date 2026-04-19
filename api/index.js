import { createClient } from '@supabase/supabase-js';
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Resend } from 'resend';
import {
    sanitize,
    validateAdInput,
    resetDailyIfNeeded,
    isAdEligible,
    calculateAdScore,
    checkRateLimitDB
} from '../lib/adsService.js';
import {
    createAd,
    getUserAds,
    toggleAd
} from '../lib/ads.js';
import {
    registerUser,
    loginUser,
    requestPasswordReset,
    resetPassword,
    getUserFromToken,
    getUserData
} from '../lib/auth.js';
import {
    createStripeCheckout
} from '../lib/payments.js';
import {
    auditLog,
    getCache,
    setCache,
    checkRateLimit
} from '../lib/utils.js';

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
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Supabase não configurado: URL ou SERVICE_ROLE_KEY faltando");
    }

    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

function setCors(req, res) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'https://yourdomain.com'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}



export const config = {
    api: { bodyParser: true },
};

export default async function handler(req, res) {

    // 🔥 Headers de segurança para nível fintech
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:;");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    setCors(req, res);

    const missingEnvs = [];
    if (!process.env.SUPABASE_URL) missingEnvs.push("SUPABASE_URL");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnvs.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!process.env.JWT_SECRET) missingEnvs.push("JWT_SECRET");

    if (missingEnvs.length > 0) {
        const msg = `Variáveis de ambiente faltando: ${missingEnvs.join(", ")}`;
        return res.status(500).json({
            error: "Configuração incompleta"
        });
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

        const action = String(req.query?.action || body?.action || "").trim();
        const supabase = getSupabase();

        // ✅ IP corrigido
        const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown";

        // ✅ rate limit só em ações específicas
        if (action === "click" || action === "createAd" || action === "login" || action === "register") {
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

            const result = await registerUser(supabase, { name, birthDate, email, password });

            if (!result.success) {
                return res.status(400).json({ error: result.error });
            }

            // 📧 envia email de verificação
            if (!resend) {
                return res.status(500).json({ error: "Resend não configurado" });
            }

            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: email,
                subject: 'Verifique sua conta',
                html: `
                  <div style="font-family: Arial, sans-serif; background:#0f172a; padding:40px; text-align:center; color:#e2e8f0;">

    <div style="max-width:500px; margin:auto; background:#020617; padding:30px; border-radius:12px; border:1px solid #1e293b;">
        
        <h2 style="margin-bottom:10px;">🚀 Confirme seu cadastro</h2>
        
        <p style="color:#94a3b8; font-size:14px;">
            Para ativar sua conta, clique no botão abaixo:
        </p>

        <a href="${baseUrl}/api?action=verify&token=${result.verifyToken}"
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
            ${baseUrl}/api?action=verify&token=${result.verifyToken}
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

            const result = await loginUser(supabase, { email, password });

            if (!result.success) {
                return res.status(401).json({ error: result.error });
            }

            return res.json(result);
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

        // ================= FORGOT PASSWORD =================
        if (action === "forgotPassword") {
            const { email } = body;

            if (!email) {
                return res.status(400).json({ error: "Email é obrigatório" });
            }

            const result = await requestPasswordReset(supabase, email);

            if (!result.success) {
                return res.status(400).json({ error: result.error });
            }

            if (!result.resetToken) {
                return res.json({ ok: true });
            }

            if (!resend) {
                return res.status(500).json({ error: "Resend não configurado" });
            }

            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: email,
                subject: 'Recuperação de senha',
                html: `
            <div style="font-family: Arial, sans-serif; background:#0f172a; padding:40px; text-align:center; color:#e2e8f0;">
    
    <div style="max-width:500px; margin:auto; background:#020617; padding:30px; border-radius:12px; border:1px solid #1e293b;">
        
        <h2 style="margin-bottom:10px;">🔐 Recuperação de senha</h2>
        
        <p style="color:#94a3b8; font-size:14px;">
            Clique no botão abaixo para redefinir sua senha.
        </p>

        <a href="${baseUrl}/reset-password.html?token=${result.resetToken}"
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
            🔄 Redefinir senha
        </a>

        <p style="margin-top:25px; font-size:12px; color:#64748b;">
            Se o botão não funcionar, copie e cole este link no navegador:
        </p>

        <p style="word-break:break-all; font-size:12px; color:#38bdf8;">
            ${baseUrl}/reset-password.html?token=${result.resetToken}
        </p>

        <hr style="margin:25px 0; border-color:#1e293b;">

        <p style="font-size:11px; color:#475569;">
            Se você não solicitou a redefinição de senha, ignore este email.
        </p>

    </div>

</div>
        `
            });

            return res.json({ ok: true });
        }

        // ================= RESET PASSWORD =================
        if (action === "resetPassword") {
            if (req.method === "GET") {
                const { token } = req.query;
                if (!token) {
                    return res.status(400).send("Token inválido ou expirado");
                }

                return res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Redefinir senha</title>
<style>
    body { margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .card { background: #020617; padding: 30px; border-radius: 12px; border: 1px solid #1e293b; width: 90%; max-width: 420px; }
    input, button { width: 100%; padding: 12px; margin-top: 10px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; }
    button { background: #3b82f6; border: none; cursor: pointer; font-weight: bold; }
    .note { color: #94a3b8; font-size: 13px; margin-top: 16px; }
</style>
</head>
<body>
<div class="card">
    <h1>Redefinir senha</h1>
    <p class="note">Digite sua nova senha abaixo.</p>
    <form id="resetForm">
        <input type="password" id="password" placeholder="Nova senha" required />
        <input type="hidden" id="token" value="${token}" />
        <button type="submit">Salvar nova senha</button>
    </form>
    <p class="note" id="message"></p>
</div>
<script>
    const form = document.getElementById('resetForm');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = document.getElementById('password').value;
        const token = document.getElementById('token').value;
        const response = await fetch('/api?action=resetPassword', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password })
        });
        const result = await response.json();
        const message = document.getElementById('message');
        if (!response.ok) {
            message.textContent = result.error || 'Erro ao redefinir senha';
            return;
        }
        message.textContent = 'Senha redefinida com sucesso! Você já pode fazer login.';
        setTimeout(() => { window.location.href = '/'; }, 2500);
    });
</script>
</body>
</html>
                `);
            }

            const { token, password } = body;
            if (!token || !password) {
                return res.status(400).json({ error: "Token e senha são obrigatórios" });
            }

            const result = await resetPassword(supabase, token, password);
            if (!result.success) {
                return res.status(400).json({ error: result.error });
            }

            return res.json({ ok: true });
        }

        // ================= GET USER =================
        if (action === "getUser") {

            const user = await getUserFromToken(extractToken(req));

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const userData = await getUserData(supabase, user.id);

            return res.json(userData);
        }

        // ================= CREATE AD =================
        if (action === "createAd") {

            const user = await getUserFromToken(extractToken(req));

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { title, description, link, bid, budget } = body;

            try {
                const result = await createAd(supabase, user, { title, description, link, bid, budget });

                if (!result.success) {
                    return res.status(400).json({ error: result.error });
                }

                return res.json({ success: true });
            } catch (error) {
                console.error('Erro ao criar anúncio:', error);
                return res.status(500).json({ error: 'Erro interno do servidor' });
            }
        }

        // ================= MY ADS =================
        if (action === "myAds") {

            const user = await getUserFromToken(extractToken(req));

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { status, search } = req.query;

            const data = await getUserAds(supabase, user.id, { status, search });

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
                    const novidade = Math.max(0, 1 - ageHours / 24); // bônus para anúncios < 24h

                    const score =
                        (ad.bid || 0) * 0.6 +
                        (ctr * 100) * 0.3 +
                        novidade * 0.1;

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

            // 🔥 valida orçamento do anúncio ATOMICAMENTE
            const cost = Number(ad.bid || 0);

            // Atualiza remaining apenas se houver saldo suficiente
            const { data: adUpdate, error: adError } = await supabase
                .from("ads")
                .update({
                    remaining: supabase.raw('remaining - ?', [cost]),
                    clicks: supabase.raw('clicks + 1'),
                    spent: supabase.raw('spent + ?', [cost]),
                    daily_spent: supabase.raw('daily_spent + ?', [cost]),
                    last_reset: updatedAd.last_reset,
                    status: supabase.raw('CASE WHEN remaining - ? <= 0 THEN \'inactive\' ELSE \'active\' END', [cost])
                })
                .eq("id", adId)
                .gte("remaining", cost)
                .gte("daily_budget", supabase.raw('daily_spent + ?', [cost]))
                .select("remaining, status");

            if (adError || !adUpdate || adUpdate.length === 0) {
                return res.status(400).json({ error: "Orçamento do anúncio esgotado ou limite diário atingido" });
            }

            // 🧾 registra transação financeira de clique
            await supabase
                .from("transactions")
                .insert([{
                    user_id: ad.user_id,
                    amount: -cost,
                    type: "click",
                    reference_id: ad.id,
                    description: `Clique no anúncio: ${ad.title}`
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
                const from = new Date(Date.now() - 5000).toISOString();

                const { data, error } = await supabase
                    .from("click_logs")
                    .select("id")
                    .eq("ip", ip)
                    .eq("ad_id", adId)
                    .gte("created_at", from);

                if (error) {
                    return true; // 🔥 não bloqueia em caso de erro
                }

                const total = data ? data.length : 0;

                // 🔥 limite: 1 clique em 5s por IP/ad
                return total < 1;

            } catch (err) {
                return true;
            }
        }

        // ================= CHECKOUT =================
        if (action === "createCheckout") {

            const user = await getUserFromToken(extractToken(req));

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { amount } = body;

            const result = await createStripeCheckout(user.id, amount);

            return res.json({ url: result.url });
        }

        // ================= TOGGLE (CORRIGIDO) =================
        if (action === "toggleAd") {

            const user = await getUserFromToken(extractToken(req));

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { id, status, featured } = body;

            const result = await toggleAd(supabase, user, { id, status, featured });

            if (!result.success) {
                return res.status(400).json({ error: result.error });
            }

            return res.json({ success: true });
        }

        // ================= DASHBOARD =================
        if (action === "dashboard") {

            const user = await getUserFromToken(extractToken(req));

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const cacheKey = `dashboard_${user.id}`;
            const cached = getCache(cacheKey);
            if (cached) {
                return res.json(cached);
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

            // 🧾 total gasto (otimizado com aggregate)
            const { data: spentData } = await supabase
                .from("transactions")
                .select("amount")
                .eq("user_id", user.id)
                .lt("amount", 0);

            const totalSpent = spentData?.reduce((acc, t) => acc + Math.abs(t.amount), 0) || 0;

            const totalClicks = ads?.reduce((acc, ad) => acc + (ad.clicks || 0), 0) || 0;
            const totalViews = ads?.reduce((acc, ad) => acc + (ad.views || 0), 0) || 0;
            const totalAds = ads?.length || 0;
            const ctr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;
            const cpc = totalClicks > 0 ? totalSpent / totalClicks : 0;

            const result = {
                balance: userData?.balance || 0,
                totalSpent,
                totalClicks,
                totalViews,
                totalAds,
                ctr,
                cpc,
                ads
            };

            setCache(cacheKey, result);

            return res.json(result);
        }

        // ================= TRANSACTIONS =================
        if (action === "transactions") {

            const user = await getUserFromToken(extractToken(req));

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { data } = await supabase
                .from("transactions")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(50);

            return res.json(data || []);
        }

        return res.status(400).json({ error: "Ação inválida" });

    } catch (err) {

        // 🔥 log de erro na tabela
        try {
            await supabase.from("errors").insert({
                message: err.message,
                stack: err.stack,
                created_at: new Date().toISOString()
            });
        } catch (logErr) {
            // Silent fail for logging
        }

        return res.status(500).json({
            error: "Erro interno"
        });
    }
}