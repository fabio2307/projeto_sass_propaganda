import { createClient } from '@supabase/supabase-js';

if (!user_id) {
    return res.status(400).json({ error: "Usuário não autenticado" });
}

export default async function handler(req, res) {

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        const { title, description, link, bid, user_id } = req.body;

        console.log("BODY RECEBIDO:", req.body);

        // ✅ validação mais completa
        if (!title || !link) {
            return res.status(400).json({ error: 'Título e link são obrigatórios' });
        }

        const { data, error } = await supabase
            .from("ads")
            .insert([{
                title,
                description: description || "",
                link,
                bid: Number(bid) || 0,
                user_id: user_id || null,
                views: 0,
                clicks: 0,
                score: 0
            }])
            .select();

        if (error) {
            console.error("ERRO SUPABASE:", error);
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ ok: true, ad: data });

    } catch (err) {
        console.error("ERRO GERAL:", err);
        return res.status(500).json({ error: 'Erro interno' });
    }
}