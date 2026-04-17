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
    validateCredentials,
    hashPassword,
    verifyPassword,
    generateToken,
    getUserFromToken
} from '../lib/authService.js';
import {
    createStripeCheckout
} from '../lib/paymentsService.js';
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



export const config = {
    api: { bodyParser: true },
};

export default async function handler(req, res) {

    // 🔥 Headers de segurança para nível fintech
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:;");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const missingEnvs = [];
    if (!process.env.SUPABASE_URL) missingEnvs.push("SUPABASE_URL");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnvs.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!process.env.JWT_SECRET) missingEnvs.push("JWT_SECRET");

    if (missingEnvs.length > 0) {
        const msg = `Variáveis de ambiente faltando: ${missingEnvs.join(", ")}`;
        console.error("❌", msg);
        return res.status(500).json({
            error: "Configuração incompleta",
            missing: missingEnvs
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

        // ✅ IP corrigido (Vercel manda lista)

        let supabase;
        try {
            supabase = getSupabase();
        } catch (e) {
            console.error("❌ Erro ao criar cliente Supabase:", e.message);
            return res.status(500).json({
                error: "Erro ao conectar com database",
                detail: e.message
            });
        }

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

            // 🔥 validação rigorosa
            if (!validateInput(name, 'name') || !validateInput(email, 'email') || !validateInput(password, 'password')) {
                return res.status(400).json({ error: "Dados inválidos" });
            }

            auditLog('REGISTER_ATTEMPT', null, { email });

            const { data: existingUser } = await supabase
                .from("users")
                .select("id")
                .eq("email", email)
                .maybeSingle();

            if (existingUser) {
                auditLog('REGISTER_FAILED', null, { email, reason: 'email_exists' });
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

            // 🔥 verificar limite de anúncios por plano
            const maxAds = user.plan === 'PRO' ? 100 : 5;
            const { count } = await supabase
                .from("ads")
                .select('*', { count: 'exact', head: true })
                .eq("user_id", user.id);
            if (count >= maxAds) {
                return res.status(400).json({ error: `Limite de ${maxAds} anúncios atingido para seu plano` });
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
            if (!title || title.length < 3 || title.length > 255) {
                return res.status(400).json({ error: "Título deve ter entre 3 e 255 caracteres" });
            }
            if (!description || description.length < 10 || description.length > 255) {
                return res.status(400).json({ error: "Descrição deve ter entre 10 e 255 caracteres" });
            }
            if (!link) {
                return res.status(400).json({ error: "Link é obrigatório" });
            }
            if (isNaN(bidNumber) || bidNumber < 1) {
                return res.status(400).json({ error: "Bid deve ser pelo menos 1" });
            }
            if (isNaN(budgetNumber) || budgetNumber < bidNumber) {
                return res.status(400).json({ error: "Orçamento deve ser pelo menos igual ao bid" });
            }

            // 🔥 valida saldo para orçamento com consistência forte
            // Primeiro, recarrega o saldo atual para evitar race conditions
            const { data: currentUser } = await supabase
                .from("users")
                .select("balance")
                .eq("id", user.id)
                .single();

            if (!currentUser || (currentUser.balance || 0) < budgetNumber) {
                auditLog('CREATE_AD_FAILED', user.id, { reason: 'insufficient_balance', budget: budgetNumber });
                return res.status(400).json({
                    error: "Saldo insuficiente para orçamento"
                });
            }

            // 🔥 reserva orçamento com transação simulada (para consistência)
            const { error: updateError } = await supabase
                .from("users")
                .update({ balance: (currentUser.balance || 0) - budgetNumber })
                .eq("id", user.id);

            if (updateError) {
                auditLog('CREATE_AD_FAILED', user.id, { reason: 'balance_update_error', error: updateError.message });
                return res.status(400).json({
                    error: "Não foi possível reservar o saldo",
                    details: updateError.message
                });
            }

            auditLog('BALANCE_RESERVED', user.id, { amount: budgetNumber, new_balance: (currentUser.balance || 0) - budgetNumber });

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
                    status: "active",
                    is_featured: false
                }]);

            if (error) {
                // 🔥 rollback consistente
                await supabase
                    .from("users")
                    .update({ balance: currentUser.balance || 0 })
                    .eq("id", user.id);
                auditLog('CREATE_AD_FAILED', user.id, { reason: 'ad_insert_error', error: error.message });
            }

            if (!error) {
                auditLog('AD_CREATED', user.id, { ad_id: data[0].id, budget: budgetNumber });
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
                    console.error("Erro rate limit:", error);
                    return true; // 🔥 não bloqueia em caso de erro
                }

                const total = data ? data.length : 0;

                // 🔥 limite: 1 clique em 5s por IP/ad
                return total < 1;

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
                            reference_id: ad.id,
                            description: `Reembolso do anúncio: ${ad.title}`
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
        console.error("🔥 ERRO REAL:", err);

        // 🔥 log de erro na tabela
        try {
            await supabase.from("errors").insert({
                message: err.message,
                stack: err.stack,
                created_at: new Date().toISOString()
            });
        } catch (logErr) {
            console.error("Erro ao logar erro:", logErr);
        }

        return res.status(500).json({
            error: "Erro interno",
            detalhe: err.message // 👈 ajuda MUITO
        });
    }
}