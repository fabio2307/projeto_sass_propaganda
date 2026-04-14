import { createClient } from '@supabase/supabase-js';
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import crypto from "crypto";
import { Resend } from 'resend';

const baseUrl = process.env.BASE_URL || "https://projeto-sass-propaganda.vercel.app";

// ✅ Resend seguro
const resend = new Resend(process.env.RESEND_API_KEY);

// ✅ Stripe seguro
const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

// 🔥 sanitização básica contra XSS
function sanitize(str) {
    return String(str).replace(/[<>]/g, "");
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

            // 🔥 NOVO: gera novo token (sem quebrar o resto)
            const newToken = crypto.randomUUID();

            await supabase
                .from("users")
                .update({ token: newToken })
                .eq("id", user.id);

            return res.json({
                token: newToken, // 🔥 agora retorna o novo token
                user: { id: user.id } // mantém compatibilidade com seu frontend
            });
        }

        // ================= REENVIAR VERIFICAÇÃO (API) =================
        if (action === "resend") {

            let body = {};

            try {
                body = typeof req.body === "string"
                    ? JSON.parse(req.body)
                    : req.body;
            } catch {
                return res.status(400).json({ error: "JSON inválido" });
            }

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

            const { title, description, link, bid } = body;

            // 🔥 força número
            const bidNumber = Number(bid);

            // 🔥 validação robusta
            if (!title || !link || isNaN(bidNumber) || bidNumber <= 0) {
                return res.status(400).json({
                    error: "Dados inválidos",
                    debug: { title, link, bid }
                });
            }

            // 🔥 sanitização segura (NÃO quebrar URL)
            const safeTitle = sanitize(title);
            const safeDescription = sanitize(description);
            const safeLink = link;

            // 🔥 valida saldo (CORRIGIDO)
            if ((user.balance || 0) < bidNumber) {
                return res.status(400).json({
                    error: "Saldo insuficiente para criar anúncio"
                });
            }

            // 🔥 DEBUG (opcional, ajuda MUITO)
            console.log("CREATE AD:", {
                user: user.id,
                title: safeTitle,
                link: safeLink,
                bid: bidNumber
            });

            const { error } = await supabase
                .from("ads")
                .insert([{
                    user_id: user.id,
                    title: safeTitle,
                    description: safeDescription,
                    link: safeLink,
                    bid: bidNumber, // ✅ corrigido
                    clicks: 0,
                    views: 0,
                    status: "active"
                }]);

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

            // 🔥 ranking inteligente
            const rankedAds = data.map(ad => {
                const ctr = ad.views > 0 ? (ad.clicks / ad.views) : 0;

                return {
                    ...ad,
                    score: (ad.bid || 0) * 0.7 + ctr * 100 * 0.3
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

            // 🔒 pega IP real
            const ip =
                req.headers["x-forwarded-for"]?.split(",")[0] ||
                req.socket.remoteAddress;

            // 🔥 RATE LIMIT REAL (por IP + anúncio)
            const allowed = await checkRateLimitDB(supabase, ip, adId);

            if (!allowed) {
                return res.json({ blocked: true });
            }

            // 🔥 registra tentativa no log de rate limit
            await supabase
                .from("click_logs")
                .insert([{ ip, ad_id: adId }]);

            // 🔥 registra clique
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

            // 🔎 pega usuário dono do anúncio
            const { data: user } = await supabase
                .from("users")
                .select("*")
                .eq("id", ad.user_id)
                .maybeSingle();

            if (!user) {
                return res.status(404).json({ error: "Usuário não encontrado" });
            }

            // 💰 custo por clique
            const cost = (ad.bid || 0) * 0.05;

            // ❌ sem saldo → pausa anúncio
            if ((user.balance || 0) < cost) {
                await supabase
                    .from("ads")
                    .update({ status: "paused" })
                    .eq("id", adId);

                return res.json({ paused: true });
            }

            // 💸 desconta do usuário (AGORA CORRETO)
            const newUserBalance = user.balance - cost;

            await supabase
                .from("users")
                .update({ balance: newUserBalance })
                .eq("id", user.id);

            // 📊 atualiza anúncio (SEM MEXER EM BALANCE DELE)
            await supabase
                .from("ads")
                .update({
                    clicks: (ad.clicks || 0) + 1
                })
                .eq("id", adId);

            // 🧾 REGISTRO FINANCEIRO (AQUI!)
            await supabase
                .from("transactions")
                .insert([{
                    user_id: user.id,
                    amount: -cost,
                    type: "click",
                    ad_id: ad.id
                }]);

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
                const { data, error } = await supabase
                    .from("click_logs")
                    .select("id")
                    .eq("ip", ip)
                    .eq("ad_id", adId) // 🔥 importante (evita travar todos os anúncios)
                    .gte(
                        "created_at",
                        new Date(Date.now() - 30000).toISOString()
                    );

                if (error) {
                    console.error("Erro rate limit:", error);
                    return true; // 🔥 não bloqueia em caso de erro
                }

                const total = data ? data.length : 0;

                // 🔥 limite: 5 cliques em 30s por anúncio + IP
                return total < 5;

            } catch (err) {
                console.error("Erro inesperado rate limit:", err);
                return true; // 🔥 fallback seguro
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

            return res.json({
                balance: userData?.balance || 0,
                totalSpent,
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