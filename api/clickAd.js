import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método não permitido" });
    }

    try {

        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ error: "Não autorizado" });
        }

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        const {
            data: { user },
            error: userError
        } = await supabase.auth.getUser();

        if (userError || !user) {
            return res.status(401).json({ error: "Token inválido" });
        }

        const { ad_id } = req.body;

        const { data: ad, error: adError } = await supabase
            .from("ads")
            .select("*")
            .eq("id", ad_id)
            .single();

        if (adError || !ad) {
            return res.status(404).json({ error: "Ad não encontrado" });
        }

        if (ad.user_id === user.id) {
            return res.status(400).json({ error: "Ação inválida" });
        }

        const { data: dono } = await supabase
            .from("users")
            .select("balance")
            .eq("id", ad.user_id)
            .single();

        if (!dono || dono.balance < ad.bid) {
            return res.status(400).json({ error: "Saldo insuficiente" });
        }

        await supabase
            .from("users")
            .update({ balance: dono.balance - ad.bid })
            .eq("id", ad.user_id);

        await supabase
            .from("ads")
            .update({
                clicks: (ad.clicks || 0) + 1,
                spent: (ad.spent || 0) + ad.bid
            })
            .eq("id", ad_id);

        await supabase.from("transactions").insert({
            user_id: ad.user_id,
            amount: -ad.bid,
            type: "click"
        });

        res.status(200).json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro interno" });
    }
}