import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {

    const { amount } = req.body;

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
            price_data: {
                currency: 'brl',
                product_data: { name: 'Saldo Ads' },
                unit_amount: amount * 100,
            },
            quantity: 1,
        }],
        mode: 'payment',
        success_url: 'https://projeto-sass-propaganda.vercel.app',
        cancel_url: 'https://projeto-sass-propaganda.vercel.app',
    });

    res.json({ url: session.url });
}