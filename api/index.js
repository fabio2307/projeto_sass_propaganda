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

    try {

        // ================= HELPERS =================
        async function getUserFromToken(token) {
            if (!token) return null;

            const { data: user, error } = await supabase
                .from("users")
                .select("*")
                .eq("token", token)
                .maybeSingle();

            if (error) {
                console.error("TOKEN ERROR:", error);
                return null;
            }

            return user || null;
        }

        // ================= REGISTER =================
        if (action === "register") {

            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: "Dados inválidos" });
            }

            // verificar se já existe
            const { data: existingUser } = await supabase
                .from("users")
                .select("id")
                .eq("email", email)
                .maybeSingle();

            if (existingUser) {
                return res.status(400).json({
                    error: "Email já cadastrado"
                });
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

            return res.json({ ok: true });
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

            // gera novo token a cada login
            const newToken = crypto.randomUUID();

            await supabase
                .from("users")
                .update({ token: newToken })
                .eq("id", user.id);

            return res.json({
                token: user.token
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

            if (!title || !link || !bid) {
                return res.status(400).json({ error: "Dados inválidos" });
            }

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
                return res.status(400).json({ error: "Erro ao criar anúncio" });
            }

            return res.json({ ok: true });
        }

        // ================= CLICK AD =================
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
                .select("*")
                .eq("id", ad.user_id)
                .single();

            if (user.balance < ad.bid) {
                await supabase
                    .from("ads")
                    .update({ active: false })
                    .eq("id", id);

                return res.json({ ok: false });
            }

            // atualização segura
            await supabase
                .from("users")
                .update({ balance: user.balance - ad.bid })
                .eq("id", user.id);

            await supabase
                .from("ads")
                .update({ clicks: ad.clicks + 1 })
                .eq("id", id);

            return res.json({ ok: true });
        }

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

        return res.status(400).json({ error: "Ação inválida" });

    } catch (err) {
        console.error("ERRO:", err);
        return res.status(500).json({ error: "Erro interno" });
    }
}