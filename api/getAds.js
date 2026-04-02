import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

    const { data: ads, error } = await supabase
        .from("ads")
        .select("*")
        .neq("user_id", user_id);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    const adsComScore = ads.map(ad => {
        const ctr = ad.views > 0 ? ad.clicks / ad.views : 0;
        const score = ad.bid * (1 + ctr);

        return { ...ad, score };
    });

    // 🔥 mistura + ordena (evita repetição)
    adsComScore.sort((a, b) => b.score - a.score);

    res.status(200).json(adsComScore);
}