const API = window.location.origin + "/api";

// LOGIN
async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const text = await res.text();
    console.log("LOGIN RAW:", text);

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        alert("Erro no servidor (login)");
        return;
    }

    if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));

        document.querySelector(".center-box").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");

        carregarAds();
    } else {
        alert(data.error || "Erro no login");
    }
}

// REGISTER
async function register() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch(`${API}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.user) {
        alert("Cadastro feito!");
    } else {
        alert(data.error || "Erro no cadastro");
    }
}

// LOGOUT
function logout() {
    localStorage.removeItem("user");
    location.reload();
}

// CRIAR ANÚNCIO
async function criarAd() {
    const user = JSON.parse(localStorage.getItem("user"));

    const ad = {
        title: document.getElementById("title").value,
        description: document.getElementById("description").value,
        link: document.getElementById("link").value,
        bid: Number(document.getElementById("bid").value),
        user_id: user.id
    };

    const res = await fetch(`${API}/createAd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ad)
    });

    const data = await res.json();

    if (data.ok) {
        alert("Anúncio criado!");
        carregarAds();
    } else {
        alert(data.error || "Erro ao criar anúncio");
    }
}

// CARREGAR ADS
async function carregarAds() {
    const res = await fetch(`${API}/getAds`);

    const text = await res.text();
    console.log("ADS RAW:", text);

    let ads;
    try {
        ads = JSON.parse(text);
    } catch {
        alert("Erro na API (ads)");
        return;
    }

    console.log("ADS PARSED:", ads);

    const container = document.getElementById("ads");
    container.innerHTML = "";

    // 🔥 TRATAMENTO CORRETO
    if (!Array.isArray(ads) || ads.length === 0) {
        container.innerHTML = "<p>Nenhum anúncio encontrado</p>";
        return;
    }

    ads.forEach(ad => {
        const div = document.createElement("div");
        div.className = "ad-card";

        div.innerHTML = `
            <h3>${ad.title}</h3>
            <p>${ad.description || ""}</p>
            <a href="${ad.link}" target="_blank">Acessar</a>
        `;

        container.appendChild(div);
    });
}

// AUTO LOGIN
if (localStorage.getItem("user")) {
    document.querySelector(".center-box").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    carregarAds();
}