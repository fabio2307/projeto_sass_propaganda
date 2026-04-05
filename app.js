const API = "/api";

// ================= SAFE JSON =================
async function safeJson(res) {
    const text = await res.text();

    if (!res.ok) {
        console.error("Erro API:", text);
        throw new Error(text);
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error("Resposta inválida");
    }
}

// ================= TOKEN =================
function getToken() {
    return localStorage.getItem("token");
}

function setToken(token) {
    localStorage.setItem("token", token);
}

function logout() {
    localStorage.clear();
    location.reload();
}

// ================= LOGIN =================
async function login() {

    const res = await fetch(`${API}?action=login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email: document.getElementById("email").value,
            password: document.getElementById("password").value
        })
    });

    const data = await safeJson(res);

    if (data.token) {
        setToken(data.token);
        init();
    } else {
        alert(data.error);
    }
}

// ================= REGISTER =================
async function register() {

    const res = await fetch(`${API}?action=register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email: document.getElementById("email").value,
            password: document.getElementById("password").value
        })
    });

    await safeJson(res);

    alert("Conta criada!");
}

// ================= INIT =================
async function init() {
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");

    await carregarSaldo();
    await carregarAds();
}

// ================= SALDO =================
async function carregarSaldo() {

    const res = await fetch(`${API}?action=getUser`, {
        headers: {
            Authorization: "Bearer " + getToken()
        }
    });

    const data = await safeJson(res);

    document.getElementById("saldo").innerText = data.balance || 0;
}

// ================= PAGAMENTO =================
async function pagar() {

    const valor = Number(document.getElementById("valor").value);

    const res = await fetch(`${API}?action=createCheckout`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken()
        },
        body: JSON.stringify({ amount: valor })
    });

    const data = await safeJson(res);

    window.location.href = data.url;
}

// ================= CRIAR AD =================
async function criarAd() {

    const res = await fetch(`${API}?action=createAd`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken()
        },
        body: JSON.stringify({
            title: document.getElementById("title").value,
            description: document.getElementById("description").value,
            link: document.getElementById("link").value,
            bid: Number(document.getElementById("bid").value)
        })
    });

    const data = await safeJson(res);

    if (data.ok) {
        alert("Anúncio criado!");
        carregarAds();
    } else {
        alert(data.error);
    }
}

// ================= LISTAR ADS =================
async function carregarAds() {

    const res = await fetch(`${API}?action=myAds`, {
        headers: {
            Authorization: "Bearer " + getToken()
        }
    });

    const ads = await safeJson(res);

    const container = document.getElementById("ads");
    container.innerHTML = "";

    ads.forEach(ad => {
        container.innerHTML += `
            <div class="card">
                <h4>${ad.title}</h4>
                <p>${ad.description}</p>
                <a href="${ad.link}" target="_blank" onclick="clicarAd('${ad.id}')">Ver</a>
            </div>
        `;
    });
}

// ================= CLICAR AD =================

async function clicarAd(id) {

    const res = await fetch(`/api?action=clickAd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
    });

    const data = await res.json();

    if (!data.ok) {
        alert("Saldo insuficiente — anúncio pausado");
    }
}

// ================= ADS PÚBLICOS =================

async function carregarAdsPublicos() {

    const res = await fetch(`/api?action=listPublicAds`);
    const ads = await res.json();

    const container = document.getElementById("ads");
    container.innerHTML = "";

    ads.forEach(ad => {

        // contar view
        fetch(`/api?action=viewAd`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: ad.id })
        });

        container.innerHTML += `
            <div class="card">
                <h3>${ad.title}</h3>
                <p>${ad.description}</p>
                <a href="${ad.link}" target="_blank"
                   onclick="clicarAd('${ad.id}')">
                   Acessar
                </a>
            </div>
        `;
    });
}

// ================= RENDER ADS =================

function renderAds(ads) {

    const container = document.getElementById("ads");
    container.innerHTML = "";

    ads.forEach(ad => {

        const ctr = ad.views > 0
            ? ((ad.clicks / ad.views) * 100).toFixed(2)
            : 0;

        container.innerHTML += `
            <div class="card">
                <h3>${ad.title}</h3>

                <p>💰 Bid: R$ ${ad.bid}</p>
                <p>👁️ Views: ${ad.views}</p>
                <p>🖱️ Cliques: ${ad.clicks}</p>
                <p>📊 CTR: ${ctr}%</p>

                <a href="${ad.link}" target="_blank">
                    Ver anúncio
                </a>
            </div>
        `;
    });
}

// ================= ATUALIZAR STATS =================

function atualizarStats(ads) {

    const totalClicks = ads.reduce((sum, ad) => sum + ad.clicks, 0);
    const totalViews = ads.reduce((sum, ad) => sum + ad.views, 0);

    document.getElementById("totalClicks").innerText = totalClicks;
    document.getElementById("totalViews").innerText = totalViews;
    document.getElementById("totalAds").innerText = ads.length;
}

// ================= AUTO INIT =================
if (getToken()) init();

window.login = login;
window.register = register;
window.criarAd = criarAd;
window.pagar = pagar;
window.clicarAd = clicarAd;
window.carregarAdsPublicos = carregarAdsPublicos;
window.renderAds = renderAds;
window.atualizarStats = atualizarStats;
window.logout = logout;