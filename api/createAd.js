import { getSupabase } from './supabase';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const supabase = getSupabase();

    try {
        const { title, image, link, bid, user_id } = req.body;

        if (!title || !link || !user_id) {
            return res.status(400).json({ error: 'Campos obrigatórios faltando' });
        }

        const { error } = await supabase.from("ads").insert([{
            user_id,
            title,
            image,
            link,
            bid: Number(bid) || 0,
            views: 0,
            clicks: 0,
            score: 0
        }]);

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ ok: true });

    } catch (err) {
        return res.status(500).json({ error: 'Erro interno' });
    }
}