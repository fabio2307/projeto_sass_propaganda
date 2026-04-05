import { createClient } from '@supabase/supabase-js';
import bcrypt from "bcryptjs";

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

            const { data: ad } = await supabase
                .from("ads")
                .select("clicks")
                .eq("id", id)
                .single();

            await supabase
                .from("ads")
                .update({ clicks: ad.clicks + 1 })
                .eq("id", id);

            return res.json({ ok: true });
        }

        // ================= LIST PUBLIC ADS =================
        if (action === "listPublicAds") {

            const { data } = await supabase
                .from("ads")
                .select("*")
                .order("bid", { ascending: false });

            return res.json(data);
        }

        return res.json({ ok: true });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro interno" });
    }
}