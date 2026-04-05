import { createClient } from '@supabase/supabase-js';

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

            const { error } = await supabase
                .from("users")
                .insert([{ email, password, balance: 0 }]);

            if (error) return res.status(400).json({ error: error.message });

            return res.json({ ok: true });
        }

        // ================= LOGIN =================
        if (action === "login") {

            const { email, password } = req.body;

            const { data, error } = await supabase
                .from("users")
                .select("*")
                .eq("email", email)
                .eq("password", password)
                .single();

            if (error || !data) {
                return res.status(401).json({ error: "Login inválido" });
            }

            return res.json({
                token: data.id
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

        return res.json({ ok: true });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro interno" });
    }
}