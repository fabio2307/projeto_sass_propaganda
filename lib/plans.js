/**
 * Planos do produto: FREE (3 anúncios), PRO (20), PREMIUM (ilimitado + destaque).
 * Valores no banco podem vir como "free", "PRO", etc. — sempre normalizar.
 */

const PLANS = {
    free: { maxAds: 3, featured: false, label: "FREE" },
    pro: { maxAds: 20, featured: false, label: "PRO" },
    premium: { maxAds: Infinity, featured: true, label: "PREMIUM" }
};

function normalizePlan(plan) {
    const p = String(plan || "free").trim().toLowerCase();
    if (p === "pro" || p === "premium" || p === "free") return p;
    if (p === "paid" || p === "basic") return "pro";
    return "free";
}

function getPlanConfig(plan) {
    const key = normalizePlan(plan);
    return { key, ...PLANS[key] };
}

/** Limite de anúncios ativos (contagem feita na query de createAd). */
function maxAdsForPlan(plan) {
    return getPlanConfig(plan).maxAds;
}

function canSetFeatured(plan) {
    return getPlanConfig(plan).featured;
}

export { normalizePlan, getPlanConfig, maxAdsForPlan, canSetFeatured, PLANS };
