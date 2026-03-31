// /api/login.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método não permitido" });
    }

    const { email, password } = req.body || {};

    const emailClean = email?.trim();
    const passwordClean = password?.trim();

    if (!emailClean || !passwordClean) {
        return res.status(400).json({ error: "Dados inválidos" });
    }

    const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", emailClean)
        .eq("password", passwordClean)
        .single();

    if (error || !data) {
        return res.status(401).json({ error: "Usuário inválido" });
    }

    res.status(200).json({ user: data });
}