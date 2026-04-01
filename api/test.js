import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    try {
        console.log("ENV:", process.env.SUPABASE_URL);

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_KEY
        );

        const { data, error } = await supabase
            .from('users')
            .select('*');

        if (error) {
            console.error("ERRO SUPABASE:", error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({
            status: "ok",
            data
        });

    } catch (err) {
        console.error("ERRO GERAL:", err);
        return res.status(500).json({
            error: err.message
        });
    }
}