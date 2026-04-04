import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método não permitido" });
    }

    try {

        const token = req.headers.authorization?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({ error: "Token não informado" });
        }

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                global: {
                    headers: { Authorization: `Bearer ${token}` }
                }
            }
        );

        const { title, description, link, bid } = req.body;

        // 🔒 validações básicas
        if (!title || !link || !bid) {
            return res.status(400).json({ error: "Campos obrigatórios faltando" });
        }

        const bidNumber = Number(bid);

        if (isNaN(bidNumber) || bidNumber <= 0) {
            return res.status(400).json({ error: "Bid inválido" });
        }

        const {
            data: { user }
        } = await supabase.auth.getUser();

        if (!user) {
            return res.status(401).json({ error: "Não autenticado" });
        }

        const { data, error } = await supabase
            .from("ads")
            .insert([{
                title,
                description: description || null,
                link,
                bid: bidNumber,
                user_id: user.id,
                views: 0,
                clicks: 0,
                spent: 0, // ⚠️ precisa existir no banco
                active: true
            }])
            .select()
            .single();

        if (error) {
            console.error(error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({ ok: true, ad: data });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro interno" });
    }
}