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

        // ================= HELPERS =================
        async function getUserFromToken(token) {
            if (!token) return null;

            const { data: user } = await supabase
                .from("users")
                .select("*")
                .eq("id", token)
                .single();

            return user || null;
        }

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
                    password: hash,
                    balance: 0,
                    plan: "free"
                }]);

            if (error) {
                console.error(error);
                return res.status(400).json({ error: error.message });
            }

            return res.json({ ok: true });
        }

        // ================= LOGIN =================
        if (action === "login") {

            const { email, password } = req.body;

            const { data: user, error } = await supabase
                .from("users")
                .select("*")
                .eq("email", email)
                .maybeSingle();

            if (error || !user) {
                return res.status(401).json({ error: "Login inválido" });
            }

            const match = await bcrypt.compare(password, user.password);

            if (!match) {
                return res.status(401).json({ error: "Login inválido" });
            }

            return res.json({
                token: user.id
            });
        }

        // ================= GET USER =================
        if (action === "getUser") {

            const token = req.headers.authorization?.split(" ")[1];

            const user = await getUserFromToken(token);

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

            const token = req.headers.authorization?.split(" ")[1];
            const user = await getUserFromToken(token);

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { title, description, link, bid } = req.body;

            // limite plano FREE
            if (user.plan === "free") {

                const { count } = await supabase
                    .from("ads")
                    .select("*", { count: "exact", head: true })
                    .eq("user_id", user.id);

                if (count >= 5) {
                    return res.status(403).json({
                        error: "Limite FREE: 5 anúncios"
                    });
                }
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
                    active: true
                }]);

            if (error) {
                console.error(error);
                return res.status(400).json({ error: error.message });
            }

            return res.json({ ok: true });
        }

        // ================= LIST USER ADS =================
        if (action === "myAds") {

            const token = req.headers.authorization?.split(" ")[1];
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

        // ================= LIST PUBLIC ADS =================
        if (action === "listPublicAds") {

            const { data } = await supabase
                .from("ads")
                .select("*")
                .eq("active", true)
                .order("bid", { ascending: false })
                .limit(20);

            return res.json(data);
        }

        // ================= CLICK AD (CPC) =================
        if (action === "clickAd") {

            const { id } = req.body;

            const { data: ad } = await supabase
                .from("ads")
                .select("*")
                .eq("id", id)
                .single();

            if (!ad || !ad.active) {
                return res.status(400).json({ error: "Anúncio inválido" });
            }

            const { data: user } = await supabase
                .from("users")
                .select("balance")
                .eq("id", ad.user_id)
                .single();

            const novoSaldo = (user.balance || 0) - ad.bid;

            if (novoSaldo < 0) {

                await supabase
                    .from("ads")
                    .update({ active: false })
                    .eq("id", id);

                return res.json({ ok: false, error: "Saldo insuficiente" });
            }

            await supabase
                .from("users")
                .update({ balance: novoSaldo })
                .eq("id", ad.user_id);

            await supabase
                .from("ads")
                .update({ clicks: (ad.clicks || 0) + 1 })
                .eq("id", id);

            return res.json({ ok: true });
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

        // ================= ADD BALANCE (TESTE) =================
        if (action === "addBalance") {

            const token = req.headers.authorization?.split(" ")[1];
            const { amount } = req.body;

            const user = await getUserFromToken(token);

            if (!user) {
                return res.status(401).json({ error: "Não autorizado" });
            }

            const novoSaldo = (user.balance || 0) + amount;

            await supabase
                .from("users")
                .update({ balance: novoSaldo })
                .eq("id", user.id);

            return res.json({ ok: true, balance: novoSaldo });
        }

        // ================= STRIPE CHECKOUT =================
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
                            product_data: { name: "Saldo Ads" },
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

        // ================= STRIPE WEBHOOK =================
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

            if (event.type === "checkout.session.completed") {

                const session = event.data.object;
                const userId = session.metadata.user_id;
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

            return res.json({ received: true });
        }

        return res.status(400).json({ error: "Ação inválida" });

    } catch (err) {
        console.error("ERRO:", err);
        return res.status(500).json({ error: "Erro interno" });
    }
}