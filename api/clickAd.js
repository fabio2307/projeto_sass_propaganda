import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../lib/rateLimit.js';

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método não permitido" });
    }

    try {

        const ip =
            req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress ||
            'unknown';

        // 🚫 rate limit
        if (!checkRateLimit(ip)) {
            return res.status(429).json({ error: "Muitos cliques, aguarde" });
        }

        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({ error: "Não autorizado" });
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

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return res.status(401).json({ error: "Usuário inválido" });
        }

        const { ad_id } = req.body;

        if (!ad_id) {
            return res.status(400).json({ error: "ad_id obrigatório" });
        }

        // 🚀 CHAMADA PROFISSIONAL (TUDO NO BANCO)
        const { data, error } = await supabase.rpc("process_click", {
            p_ad_id: ad_id,
            p_ip: ip,
            p_user_id: user.id
        });

        if (error) {
            console.error(error);
            return res.status(500).json({ error: "Erro no clique" });
        }

        return res.status(200).json(data);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro interno" });
    }
}