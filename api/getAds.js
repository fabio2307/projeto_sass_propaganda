import { getSupabase } from './supabase';

export default async function handler(req, res) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from("ads")
        .select("*")
        .order("score", { ascending: false });

    if (error) return res.status(400).json({ error });

    res.status(200).json(data);
}