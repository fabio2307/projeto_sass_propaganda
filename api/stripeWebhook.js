import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
    api: { bodyParser: false },
};

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).send("Método não permitido");
    }

    const sig = req.headers['stripe-signature'];

    let event;

    try {
        const rawBody = await buffer(req);

        event = stripe.webhooks.constructEvent(
            rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

    } catch (err) {
        console.error("WEBHOOK ERROR:", err.message);
        return res.status(400).send("Erro webhook");
    }

    // ================= PAGAMENTO CONCLUÍDO =================
    if (event.type === 'checkout.session.completed') {

        const session = event.data.object;

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );

        const userId = session.metadata.user_id;
        const amount = Number(session.metadata.amount);

        if (!userId || !amount) return;

        const { data: user } = await supabase
            .from("users")
            .select("balance")
            .eq("id", userId)
            .single();

        if (!user) return;

        await supabase
            .from("users")
            .update({
                balance: user.balance + amount
            })
            .eq("id", userId);

        await supabase.from("transactions").insert({
            user_id: userId,
            amount: amount,
            type: "deposit",
            status: "completed"
        });
    }

    return res.json({ received: true });
}