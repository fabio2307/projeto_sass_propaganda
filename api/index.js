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

            const { email, password } = req.body;

            if (!email || !password) {
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

            return res.json({ token });
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

            const newToken = crypto.randomUUID();

            const { error: updateError } = await supabase
                .from("users")
                .update({ token: newToken })
                .eq("id", user.id);

            if (updateError) {
                console.error("❌ ERRO UPDATE TOKEN:", updateError);
                return res.status(500).json({ error: "Erro ao atualizar token" });
            }

            console.log("✅ TOKEN ATUALIZADO:", newToken);

            return res.json({ token: newToken });
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