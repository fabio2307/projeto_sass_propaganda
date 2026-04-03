import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {

    const { user_id } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: "user_id obrigatório" });
    }

    const { data: ads, error } = await supabase
        .from("ads")
        .select(`
      *,
      users(balance)
    `)
        .neq("user_id", user_id)
        .order("bid", { ascending: false })
        .limit(50);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    // 🔥 score simples (bid + CTR)
    const adsComScore = ads.map(ad => {
        const ctr = ad.views > 0 ? ad.clicks / ad.views : 0;
        const score = ad.bid * (1 + ctr);

        return { ...ad, score };
    });

    // 🔥 filtrar + ordenar + limitar
    const feed = adsComScore
        .filter(ad => ad.users?.balance >= ad.bid)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

    res.status(200).json(feed);
}