import { createClient } from '@supabase/supabase-js';
import bcrypt from "bcryptjs";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {

    const { action } = req.query;

    try {

        // ================= REGISTER =================
        if (action === "register") {

            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: "Dados inválidos" });
            }

            const hash = await bcrypt.hash(password, 10);

            const { error } = await supabase
                .from("users")
                .insert([{
                    email,
                    password: hash, // ✅ AGORA CORRETO
                    balance: 0
                }]);

            if (error) return res.status(400).json({ error: error.message });

            return res.json({ ok: true });
        }

        // ================= LOGIN =================
        if (action === "login") {

            const { email, password } = req.body;

            // 1. Busca usuário pelo email
            const { data: user, error } = await supabase
                .from("users")
                .select("*")
                .eq("email", email)
                .single();

            if (error || !user) {
                return res.status(401).json({ error: "Login inválido" });
            }

            // 2. Compara senha com hash
            const match = await bcrypt.compare(password, user.password);

            if (!match) {
                return res.status(401).json({ error: "Login inválido" });
            }

            // 3. Retorna token
            return res.json({
                token: user.id
            });
        }

        // ================= GET USER =================
        if (action === "getUser") {

            const token = req.headers.authorization?.split(" ")[1];

            const { data: { user } } = await supabase.auth.getUser(token);

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            if (!token) return res.status(401).json({ error: "Sem token" });

            const { data } = await supabase
                .from("users")
                .select("balance")
                .eq("id", user.id)
                .single();

            return res.json(data);
        }

        // ================= FUNÇÃO AUXILIAR =================

        async function getUserFromToken(token) {

            if (!token) return null;

            // 🔐 JWT (novo)
            const { data } = await supabase.auth.getUser(token);

            if (data?.user) {
                return data.user;
            }

            // ⚠️ fallback (antigo)
            const { data: user } = await supabase
                .from("users")
                .select("*")
                .eq("id", token)
                .single();

            if (user) {
                return { id: user.id };
            }

            return null;
        }

        // ================= CREATE AD =================
        if (action === "createAd") {

            const token = req.headers.authorization?.split(" ")[1];

            if (!token) {
                return res.status(401).json({ error: "Sem token" });
            }

            // 🔐 pegar usuário real via JWT
            const user = await getUserFromToken(token);

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            // 🧠 buscar plano do usuário
            const { data: dbUser } = await supabase
                .from("users")
                .select("plan")
                .eq("id", user.id)
                .single();

            // 🚫 limitar plano FREE
            if (dbUser?.plan === "free") {

                const { count } = await supabase
                    .from("ads")
                    .select("*", { count: "exact", head: true })
                    .eq("user_id", user.id);

                if (count >= 5) {
                    return res.status(403).json({
                        error: "Limite do plano gratuito atingido (máx 5 anúncios)"
                    });
                }
            }

            const { title, description, link, bid } = req.body;

            // 💾 criar anúncio
            const { error } = await supabase
                .from("ads")
                .insert([{
                    user_id: user.id, // ✅ agora correto
                    title,
                    description,
                    link,
                    bid,
                    active: true
                }]);

            if (error) {
                return res.status(400).json({ error: error.message });
            }

            return res.json({ ok: true });
        }

        // ================= LIST ADS =================
        if (action === "myAds") {

            const token = req.headers.authorization?.split(" ")[1];

            const user = await getUserFromToken(token);

            if (!user) return res.status(401).json({ error: "Não autorizado" });

            const { data } = await supabase
                .from("ads")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });

            return res.json(data);
        }

        // ================= CLICK AD =================
        if (action === "clickAd") {

            const { id } = req.body;

            // 1. Buscar anúncio
            const { data: ad } = await supabase
                .from("ads")
                .select("*")
                .eq("id", id)
                .single();

            if (!ad || !ad.active) {
                return res.status(400).json({ error: "Anúncio inválido" });
            }

            // 2. Buscar usuário dono do anúncio
            const { data: user } = await supabase
                .from("users")
                .select("balance")
                .eq("id", ad.user_id)
                .single();

            const novoSaldo = (user.balance || 0) - ad.bid;

            // 3. Se saldo acabou → desativa anúncio
            if (novoSaldo < 0) {

                await supabase
                    .from("ads")
                    .update({ active: false })
                    .eq("id", id);

                return res.json({ ok: false, error: "Saldo insuficiente" });
            }

            // 4. Atualiza saldo
            await supabase
                .from("users")
                .update({ balance: novoSaldo })
                .eq("id", ad.user_id);

            // 5. Atualiza clique
            await supabase
                .from("ads")
                .update({ clicks: ad.clicks + 1 })
                .eq("id", id);

            return res.json({ ok: true });
        }


        // ================= ADD BALANCE (TESTE) =================

        if (action === "addBalance") {

            const token = req.headers.authorization?.split(" ")[1];
            const { amount } = req.body;

            const user = await getUserFromToken(token);

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { data: dbUser } = await supabase
                .from("users")
                .select("balance")
                .eq("id", user.id)
                .single();

            const novoSaldo = (dbUser.balance || 0) + amount;

            await supabase
                .from("users")
                .update({ balance: novoSaldo })
                .eq("id", user.id);

            return res.json({ ok: true, balance: novoSaldo });
        }

        // ================= CREATE CHECKOUT =================

        if (action === "createCheckout") {

            const token = req.headers.authorization?.split(" ")[1];
            const { amount } = req.body;

            const user = await getUserFromToken(token);

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                mode: "payment",

                line_items: [
                    {
                        price_data: {
                            currency: "brl",
                            product_data: {
                                name: "Adicionar saldo"
                            },
                            unit_amount: amount * 100
                        },
                        quantity: 1
                    }
                ],

                success_url: `${process.env.BASE_URL}/?success=true`,
                cancel_url: `${process.env.BASE_URL}/?cancel=true`,

                metadata: {
                    user_id: user.id
                }
            });

            return res.json({ url: session.url });
        }

        // ================= LIST PUBLIC ADS =================
        if (action === "listPublicAds") {

            const { data } = await supabase
                .from("ads")
                .select("*")
                .eq("active", true) // só ativos
                .order("bid", { ascending: false }) // maior paga mais
                .limit(20);

            return res.json(data);
        }

        // ================= WEBHOOK STRIPE =================

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
                return res.status(400).send(`Webhook error: ${err.message}`);
            }

            // 💰 PAGAMENTO CONFIRMADO
            if (event.type === "checkout.session.completed") {

                const session = event.data.object;

                const userId = session.metadata.user_id;

                // 🧠 DIFERENCIAR TIPO
                if (session.mode === "payment") {

                    // 💰 SALDO
                    const amount = session.amount_total / 100;

                    const { data: user } = await supabase
                        .from("users")
                        .select("balance")
                        .eq("id", userId)
                        .single();

                    await supabase
                        .from("users")
                        .update({
                            balance: (user.balance || 0) + amount
                        })
                        .eq("id", userId);

                    console.log("Saldo adicionado:", amount);
                }

                if (session.mode === "subscription") {

                    // 💳 PLANO
                    await supabase
                        .from("users")
                        .update({
                            plan: "pro"
                        })
                        .eq("id", userId);

                    console.log("Plano ativado PRO");
                }
            }

            // ================= VIEW AD =================
            if (action === "viewAd") {

                const { id } = req.body;

                const { data: ad } = await supabase
                    .from("ads")
                    .select("views")
                    .eq("id", id)
                    .single();

                await supabase
                    .from("ads")
                    .update({ views: (ad.views || 0) + 1 })
                    .eq("id", id);

                return res.json({ ok: true });
            }

            // ================= CREATE SUBSCRIPTION =================

            if (action === "createSubscription") {

                const token = req.headers.authorization?.split(" ")[1];

                const { data: { user } } = await supabase.auth.getUser(token);

                const session = await stripe.checkout.sessions.create({
                    mode: "subscription",

                    line_items: [
                        {
                            price: "price_xxx", // ID do Stripe
                            quantity: 1
                        }
                    ],

                    success_url: `${process.env.BASE_URL}/?success=true`,
                    cancel_url: `${process.env.BASE_URL}/?cancel=true`,

                    metadata: {
                        user_id: user.id
                    }
                });

                return res.json({ url: session.url });
            }

            return res.json({ ok: true });

        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: "Erro interno" });
        }
    }