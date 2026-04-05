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

            if (!token) return res.status(401).json({ error: "Sem token" });

            const { data } = await supabase
                .from("users")
                .select("balance")
                .eq("id", token)
                .single();

            return res.json(data);
        }

        // ================= CREATE AD =================
        if (action === "createAd") {

            const token = req.headers.authorization?.split(" ")[1];

            if (!token) return res.status(401).json({ error: "Sem token" });

            const { title, description, link, bid } = req.body;

            const { error } = await supabase
                .from("ads")
                .insert([{
                    user_id: token,
                    title,
                    description,
                    link,
                    bid
                }]);

            if (error) return res.status(400).json({ error: error.message });

            return res.json({ ok: true });
        }

        // ================= LIST ADS =================
        if (action === "myAds") {

            const token = req.headers.authorization?.split(" ")[1];

            if (!token) return res.status(401).json({ error: "Sem token" });

            const { data } = await supabase
                .from("ads")
                .select("*")
                .eq("user_id", token)
                .order("created_at", { ascending: false });

            return res.json(data);
        }

        // ================= ADD BALANCE =================
        if (action === "addBalance") {

            const token = req.headers.authorization?.split(" ")[1];
            const { amount } = req.body;

            if (!token) {
                return res.status(401).json({ error: "Sem token" });
            }

            const { data: user } = await supabase
                .from("users")
                .select("balance")
                .eq("id", token)
                .single();

            const novoSaldo = (user.balance || 0) + amount;

            await supabase
                .from("users")
                .update({ balance: novoSaldo })
                .eq("id", token);

            return res.json({ ok: true, balance: novoSaldo });
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

        // ================= CREATE CHECKOUT =================

        if (action === "createCheckout") {

            const token = req.headers.authorization?.split(" ")[1];
            const { amount } = req.body;

            if (!token) {
                return res.status(401).json({ error: "Sem token" });
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
                            unit_amount: amount * 100 // centavos
                        },
                        quantity: 1
                    }
                ],

                success_url: `${process.env.BASE_URL}/?success=true`,
                cancel_url: `${process.env.BASE_URL}/?cancel=true`,

                metadata: {
                    user_id: token
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
                const amount = session.amount_total / 100;

                // pega saldo atual
                const { data: user } = await supabase
                    .from("users")
                    .select("balance")
                    .eq("id", userId)
                    .single();

                // soma saldo
                await supabase
                    .from("users")
                    .update({
                        balance: (user.balance || 0) + amount
                    })
                    .eq("id", userId);
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
                    .update({ views: ad.views + 1 })
                    .eq("id", id);

                return res.json({ ok: true });
            }

            return res.json({ received: true });
        }

        return res.json({ ok: true });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro interno" });
    }
}