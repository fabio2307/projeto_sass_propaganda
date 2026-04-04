import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {

    const sig = req.headers['stripe-signature'];

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        return res.status(400).send(`Webhook Error`);
    }

    if (event.type === 'checkout.session.completed') {

        const session = event.data.object;

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        const userId = session.metadata.user_id;
        const amount = session.amount_total / 100;

        const { data: user } = await supabase
            .from("users")
            .select("balance")
            .eq("id", userId)
            .single();

        await supabase
            .from("users")
            .update({
                balance: user.balance + amount
            })
            .eq("id", userId);
    }

    res.json({ received: true });
}