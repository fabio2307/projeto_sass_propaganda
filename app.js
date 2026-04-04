const API = window.location.origin + "/api";

// ================= SAFE JSON =================
async function safeJson(res) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        console.error("Resposta inválida:", text);
        throw new Error("Erro na API");
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
        headers: { "Content-Type": "application/json" },
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
        alert(data.error || "Erro no login");
    }
}

async function register() {

    const res = await fetch(`${API}?action=register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: document.getElementById("email").value,
            password: document.getElementById("password").value
        })
    });

    const data = await safeJson(res);

    if (data.error) {
        alert(data.error);
    } else {
        alert("Conta criada! Faça login.");
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

    const valor = document.getElementById("valor").value;

    if (!valor || valor <= 0) {
        alert("Digite um valor válido");
        return;
    }

    const res = await fetch(`${API}?action=createCheckout`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken()
        },
        body: JSON.stringify({ amount: Number(valor) })
    });

    const data = await safeJson(res);

    if (data.url) {
        window.location.href = data.url;
    } else {
        alert(data.error || "Erro ao iniciar pagamento");
    }
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

// ================= CLICK =================

function clicarAd(id, url) {

    fetch(`${API}?action=clickAd`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken()
        },
        body: JSON.stringify({ ad_id: id })
    });

    window.open(url, "_blank");
}

// ================= ADS =================

async function carregarAds() {

    const res = await fetch(`${API}?action=myAds`, {
        headers: {
            Authorization: "Bearer " + getToken()
        }
    });

    const ads = await safeJson(res);

    const container = document.getElementById("ads");
    container.innerHTML = "";

    let totalClicks = 0;
    let totalViews = 0;

    ads.forEach(ad => {

        totalClicks += ad.clicks || 0;
        totalViews += ad.views || 0;

        container.innerHTML += `
            <div class="card">
                <h4>${ad.title}</h4>
                <p>${ad.description || ""}</p>

                <button onclick="clicarAd('${ad.id}', '${ad.link}')">
                    🔗 Ver produto
                </button>

                <p>💰 Bid: R$ ${ad.bid}</p>
                <p>👁 Views: ${ad.views || 0}</p>
                <p>🖱 Clicks: ${ad.clicks || 0}</p>
            </div>
        `;
    });

    document.getElementById("totalAds").innerText = ads.length;
    document.getElementById("totalClicks").innerText = totalClicks;
    document.getElementById("totalViews").innerText = totalViews;
}

// ================= AUTO INIT =================

if (getToken()) {
    init();
}