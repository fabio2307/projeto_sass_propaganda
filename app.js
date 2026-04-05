const API = "/api";

// ================= SAFE JSON =================
async function safeJson(res) {

    let text = await res.text();

    try {
        return JSON.parse(text);
    } catch {
        console.error("Erro API:", text);
        throw new Error("Resposta inválida da API");
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
            email: email.value,
            password: password.value
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

async function register() {

    const res = await fetch(`${API}?action=register`, {
        method: "POST"
    });

    const data = await safeJson(res);

    alert("Conta criada!");
}

// ================= INIT =================

async function init() {

    loginBox.classList.add("hidden");
    dashboard.classList.remove("hidden");

    await carregarSaldo();
    await carregarAds();
}

// ================= SALDO =================

async function carregarSaldo() {

    const res = await fetch(`${API}?action=getUser`);
    const data = await safeJson(res);

    saldo.innerText = data.balance;
}

// ================= PAGAMENTO =================

async function pagar() {

    const valor = document.getElementById("valor").value;

    const res = await fetch(`${API}?action=createCheckout`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(valor) })
    });

    const data = await safeJson(res);

    window.location.href = data.url;
}

// ================= ADS =================

async function carregarAds() {

    const res = await fetch(`${API}?action=myAds`);
    const ads = await safeJson(res);

    const container = document.getElementById("ads");
    container.innerHTML = "";

    ads.forEach(ad => {
        container.innerHTML += `
            <div class="card">
                <h4>${ad.title}</h4>
                <p>${ad.description}</p>
                <a href="${ad.link}" target="_blank">Ver</a>
            </div>
        `;
    });
}

// ================= AUTO INIT =================

if (getToken()) init();