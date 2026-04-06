const API = "/api";

// ================= SAFE JSON =================
async function safeJson(res) {
    const text = await res.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("Erro inesperado");
    }

    if (!res.ok) {
        throw new Error(data.error || "Erro desconhecido");
    }

    return data;
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
    try {
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

        setToken(data.token);
        await init();

    } catch (err) {
        alert(err.message);
    }
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
                email: document.getElementById("email").value,
                password: document.getElementById("password").value
            })
        });

        await safeJson(res);

        alert("Conta criada! Agora faça login.");

    } catch (err) {
        alert(err.message);
    }
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
    try {
        const res = await fetch(`${API}?action=getUser`, {
            headers: {
                Authorization: "Bearer " + getToken()
            }
        });

        const data = await safeJson(res);

        document.getElementById("saldo").innerText = data.balance || 0;

    } catch (err) {
        alert(err.message);
    }
}

// ================= PAGAMENTO =================
async function pagar() {
    try {
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

    } catch (err) {
        alert(err.message);
    }
}

// ================= CRIAR AD =================
async function criarAd() {
    try {
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

        alert("Anúncio criado!");
        await carregarAds();

    } catch (err) {
        alert(err.message);
    }
}

// ================= LISTAR ADS =================
async function carregarAds() {
    try {
        const res = await fetch(`${API}?action=myAds`, {
            headers: {
                Authorization: "Bearer " + getToken()
            }
        });

        const ads = await safeJson(res);

        renderAds(ads);
        atualizarStats(ads);

    } catch (err) {
        alert(err.message);
    }
}

// ================= CLICAR AD =================
async function clicarAd(id) {
    try {
        const res = await fetch(`/api?action=clickAd`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
        });

        const data = await res.json();

        if (!data.ok) {
            alert("Saldo insuficiente — anúncio pausado");
        }

    } catch (err) {
        console.error(err);
    }
}

// ================= ADS PÚBLICOS =================
async function carregarAdsPublicos() {
    try {
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

    } catch (err) {
        console.error(err);
    }
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

// ================= STATS =================
function atualizarStats(ads) {
    const totalClicks = ads.reduce((sum, ad) => sum + ad.clicks, 0);
    const totalViews = ads.reduce((sum, ad) => sum + ad.views, 0);

    document.getElementById("totalClicks").innerText = totalClicks;
    document.getElementById("totalViews").innerText = totalViews;
    document.getElementById("totalAds").innerText = ads.length;
}

// ================= INIT AUTO =================
window.onload = () => {
    if (getToken()) {
        init();
    }
};

// ================= EXPORT GLOBAL =================
window.login = login;
window.register = register;
window.criarAd = criarAd;
window.pagar = pagar;
window.clicarAd = clicarAd;
window.carregarAdsPublicos = carregarAdsPublicos;
window.renderAds = renderAds;
window.atualizarStats = atualizarStats;
window.logout = logout;
window.init = init;