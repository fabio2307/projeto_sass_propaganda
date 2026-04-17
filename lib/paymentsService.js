// lib/paymentsService.js
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

// 🔥 cria sessão de checkout Stripe
async function createStripeCheckout(userId, amount) {
    if (!stripe) throw new Error("Stripe não configurado");
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
            price_data: {
                currency: 'brl',
                product_data: { name: 'Crédito para anúncios' },
                unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.BASE_URL}/?success=true`,
        cancel_url: `${process.env.BASE_URL}/?canceled=true`,
        metadata: { user_id: userId },
    });
    return session;
}

// 🔥 processa webhook Stripe
async function processStripeWebhook(event) {
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const sessionId = session.id;
        const userId = session.metadata.user_id;
        const amount = session.amount_total / 100;

        // evita duplicidade
        const { data: existing } = await supabase
            .from("transactions")
            .select("id")
            .eq("reference_id", sessionId)
            .maybeSingle();
        if (existing) return;

        const { data: user } = await supabase
            .from("users")
            .select("balance")
            .eq("id", userId)
            .single();
        if (!user) throw new Error("Usuário não encontrado");

        await supabase
            .from("users")
            .update({ balance: (user.balance || 0) + amount })
            .eq("id", userId);

        await supabase.from("transactions").insert({
            user_id: userId,
            amount: amount,
            type: "deposit",
            reference_id: sessionId,
            description: `Depósito via Stripe: R$ ${amount.toFixed(2)}`
        });
    }
}

export {
    createStripeCheckout,
    processStripeWebhook
};