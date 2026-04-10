const API = "/api";

// ================= SAFE JSON =================
async function safeJson(res) {
    const text = await res.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        console.error("RESPOSTA NÃO JSON:", text);
        throw new Error("Erro inesperado do servidor");
    }

    if (!res.ok) {
        throw new Error(data.error || "Erro desconhecido");
    }

    return data;
}

// ================= TOKEN =================
function getToken() {
    const token = localStorage.getItem("token");
    return token && token !== "undefined" ? token : null;
}

// ================= TOKEN =================
function setToken(token) {
    localStorage.setItem("token", token);
}

// ================= LOGOUT =================
function logout() {
    localStorage.clear();
    location.reload();
}

// ================= LOGIN/REGISTER =================
function showRegister() {
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("registerBox").classList.remove("hidden");
}

// ================= LOGIN/REGISTER =================
function showLogin() {
    document.getElementById("registerBox").classList.add("hidden");
    document.getElementById("loginBox").classList.remove("hidden");
}

// ================= REGISTER =================
async function register() {
    try {
        const res = await fetch(`${API}?action=register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: document.getElementById("registerName").value,
                age: Number(document.getElementById("registerAge").value),
                email: document.getElementById("registerEmail").value,
                password: document.getElementById("registerPassword").value
            })
        });

        const data = await safeJson(res);

        alert("Conta criada com sucesso!");
        showLogin();

    } catch (err) {
        console.error(err);
        alert("Erro: " + err.message);
    }
}

// ================= LOGIN =================
async function login() {
    try {
        const emailInput = document.getElementById("loginEmail");
        const passwordInput = document.getElementById("loginPassword");

        if (!emailInput || !passwordInput) {
            console.error("Campos de login não encontrados na página");
            alert("Erro de interface. Recarregue a página.");
            return;
        }

        const email = emailInput.value;
        const password = passwordInput.value;

        if (!email || !password) {
            alert("Preencha email e senha");
            return;
        }

        const res = await fetch(`${API}?action=login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        const data = await safeJson(res);

        localStorage.setItem("token", data.token);
        localStorage.setItem("userId", data.user.id);

        alert("Login realizado!");

        // esconder login
        document.getElementById("loginBox").classList.add("hidden");

        // mostrar dashboard
        document.getElementById("dashboard").classList.remove("hidden");

        // carregar dados
        await carregarSaldo();
        await carregarAds();

    } catch (err) {
        console.error(err);
        alert("Erro no login: " + err.message);
    }
}

// ================= INIT =================
async function init() {
    const token = getToken();

    if (!token) {
        console.log("❌ Sem token");
        return;
    }

    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");

    await carregarSaldo();
    await carregarAds();

    if (window.location.search.includes("success")) {
        alert("Pagamento aprovado!");
        carregarSaldo();
        window.history.replaceState({}, document.title, "/");
    }
}

// ================= SALDO =================
async function carregarSaldo() {
    try {
        const token = getToken();

        const res = await fetch(`${API}?action=getUser`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await safeJson(res);

        document.getElementById("saldo").innerText = data.balance || 0;

    } catch (err) {
        alert(err.message);
    }
}

// ================= API =================
function renderAds(ads) {
    const container = document.getElementById("ads");
    const userId = localStorage.getItem("userId");

    if (!container) return;

    container.innerHTML = ads.map(ad => {
        const ctr = ad.views > 0
            ? ((ad.clicks / ad.views) * 100).toFixed(1)
            : 0;

        return `
        <div class="ad-card">
            <h3>${ad.title}</h3>
            <p>${ad.description || "Sem descrição"}</p>

            <a href="${ad.link}" target="_blank"
              onclick="registrarClick('${ad.id}')">
             🔗 Acessar produto
           </a>

            <div class="ad-metrics">
                <span>👁 ${ad.views}</span>
                <span>🖱 ${ad.clicks}</span>
                <span>📊 ${ctr}%</span>
            </div>

            <div class="ad-metrics">
                <span>💰 R$ ${ad.bid}</span>
                <span>⭐ ${ad.score || 0}</span>
                <span>📌 ${ad.status}</span>
            </div>
        </div>
        `;
    }).join("");
}

// ================= CLICK =================
async function registrarClick(adId) {
    try {
        await fetch(`${API}?action=click`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ adId })
        });
    } catch {
        console.error("Erro ao registrar clique");
    }
}

// ================= STATS =================
function atualizarStats(ads) {
    const totalAds = ads.length;
    const totalClicks = ads.reduce((acc, ad) => acc + (ad.clicks || 0), 0);
    const totalViews = ads.reduce((acc, ad) => acc + (ad.views || 0), 0);

    document.getElementById("totalAds").innerText = totalAds;
    document.getElementById("totalClicks").innerText = totalClicks;
    document.getElementById("totalViews").innerText = totalViews;
}

// ================= CRIAR AD =================
async function criarAd() {
    try {
        const title = document.getElementById("title").value;
        const description = document.getElementById("description").value;
        const link = document.getElementById("link").value;
        const bid = Number(document.getElementById("bid").value);

        if (!title || !link || isNaN(bid) || bid <= 0) {
            throw new Error("Preencha os campos corretamente");
        }

        const res = await fetch(`${API}?action=createAd`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${getToken()}`
            },
            body: JSON.stringify({ title, description, link, bid })
        });

        await safeJson(res);

        alert("Anúncio criado com sucesso 🚀");

        document.getElementById("title").value = "";
        document.getElementById("description").value = "";
        document.getElementById("link").value = "";
        document.getElementById("bid").value = "";
        document.getElementById("valor").value = "";

        await carregarAds();

    } catch (err) {
        alert(err.message);
    }
}

// ================= ADS =================
async function carregarAds() {
    try {
        const res = await fetch(`${API}?action=myAds`, {
            headers: {
                Authorization: `Bearer ${getToken()}`
            }
        });

        const ads = await safeJson(res);

        renderAds(ads);
        atualizarStats(ads);

    } catch (err) {
        alert(err.message);
    }
}

// ================= PAGAMENTO =================
if (action === "createCheckout") {

    if (!stripe) {
        return res.status(500).json({ error: "Stripe não configurado" });
    }

    const user = await getUserFromToken(extractToken(req));

    if (!user) {
        return res.status(401).json({ error: "Não autorizado" });
    }

    const { amount } = body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Valor inválido" });
    }

    try {

        const baseUrl = req.headers.origin || "https://projeto-sass-propaganda.vercel.app";

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card", "boleto"], // ✅ aqui está o ajuste
            mode: "payment",
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

        return res.json({ url: session.url });

    } catch (err) {
        console.error("🔥 ERRO STRIPE:", err);

        return res.status(500).json({
            error: "Erro ao criar pagamento",
            detalhe: err.message
        });
    }
}

// ================= TOGGLE AD =================
async function toggleAd(id, status) {
    try {
        const token = localStorage.getItem("token");

        if (!token) {
            alert("Você precisa estar logado");
            return;
        }

        const newStatus = status === "active" ? "paused" : "active";

        const res = await fetch(`${API}?action=toggleAd`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ id, status: newStatus })
        });

        const data = await res.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        carregarAdsPublicos();

    } catch (err) {
        console.error(err);
    }
}

// ================= DOM CONTENT LOADED =================
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btnLogin");

    if (btn) {
        btn.addEventListener("click", login);
    }
});

// ================= EXPORTS PARA HTML =================
if (document.getElementById("email")) {
    window.login = login;
}

// ================= EXPORT =================

window.register = register;
window.pagar = pagar;
window.logout = logout;
window.init = init;
window.carregarAds = carregarAds;
window.showRegister = showRegister;
window.showLogin = showLogin;
window.criarAd = criarAd;
