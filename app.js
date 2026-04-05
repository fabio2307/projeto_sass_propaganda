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

    const res = await fetch(`${API}?action=addBalance`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken()
        },
        body: JSON.stringify({ amount: valor })
    });

    const data = await safeJson(res);

    alert("Saldo adicionado!");
    carregarSaldo();
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

    await fetch(`${API}?action=clickAd`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ id })
    });
}

// ================= ADS PÚBLICOS =================

async function carregarAdsPublicos() {

    const res = await fetch(`/api?action=listPublicAds`);
    const ads = await res.json();

    const container = document.getElementById("ads");

    ads.forEach(ad => {
        container.innerHTML += `
            <div>
                <h3>${ad.title}</h3>
                <a href="${ad.link}" target="_blank">${ad.link}</a>
            </div>
        `;
    });
}

// ================= AUTO INIT =================
if (getToken()) init();

window.login = login;
window.register = register;
window.criarAd = criarAd;
window.pagar = pagar;
window.clicarAd = clicarAd;
window.carregarAdsPublicos = carregarAdsPublicos;
window.logout = logout;