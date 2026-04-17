import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

// 🔥 cria sessão de checkout Stripe
async function createStripeCheckout(userId, amount) {
    if (!stripe) throw new Error("Stripe não configurado");

    if (!amount || amount <= 0) {
        throw new Error("Valor inválido");
    }

    const baseUrl = process.env.BASE_URL || "https://projeto-sass-propaganda.vercel.app";

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "boleto"],
        mode: "payment",
        client_reference_id: userId,
        metadata: {
            user_id: userId,
            amount: amount.toString()
        },
        line_items: [{
            price_data: {
                currency: "brl",
                product_data: {
                    name: "Adicionar saldo"
                },
                unit_amount: Math.round(amount * 100)
            },
            quantity: 1
        }],
        success_url: `${baseUrl}/?success=true`,
        cancel_url: `${baseUrl}/?cancel=true`
    });

    return { url: session.url };
}

// 🔥 processa webhook Stripe (para futuro)
async function processStripeWebhook(event, supabase) {
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const sessionId = session.id;
        const userId = session.metadata.user_id;
        const amount = session.amount_total / 100;

        // Evita duplicidade
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

// 🔥 integração futura com PIX (Mercado Pago ou Asaas)
async function createPixPayment(amount) {
    // TODO: implementar integração com PIX
    throw new Error("PIX ainda não implementado");
}

export {
    createStripeCheckout,
    processStripeWebhook,
    createPixPayment
};