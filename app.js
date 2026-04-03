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

    const data = await res.json();

    if (data.user && data.token) {
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("token", data.token);

        alert("Logado!");
        location.reload();
    } else {
        alert(data.error);
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
        alert("Conta criada!");
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

    const token = localStorage.getItem("token");

    const ad = {
        title: document.getElementById("title").value,
        description: document.getElementById("description").value,
        link: document.getElementById("link").value,
        bid: Number(document.getElementById("bid").value)
    };

    const res = await fetch(`${API}/createAd`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(ad)
    });

    const data = await res.json();

    if (data.ok) {
        alert("Anúncio criado!");
        carregarAds();
    } else {
        alert(data.error);
    }
}

// CARREGAR ADS
async function carregarAds() {

    const token = localStorage.getItem("token");

    const res = await fetch(`${API}/getAds`, {
        headers: {
            "Authorization": `Bearer ${token}`
        }
    });

    const data = await res.json();

    const container = document.getElementById("ads");
    container.innerHTML = "";

    if (!data.length) {
        container.innerHTML = "<p>Nenhum anúncio</p>";
        return;
    }

    data.forEach(ad => {
        const div = document.createElement("div");

        div.innerHTML = `
            <h3>${ad.title}</h3>
            <p>${ad.description}</p>
        `;

        container.appendChild(div);
    });
}

async function carregarFeed() {

    const user = JSON.parse(localStorage.getItem("user"));

    const res = await fetch(`${API}/getFeed?user_id=${user.id}`);
    const ads = await res.json();

    renderAds(ads);
}

// DEPOSITAR
async function depositar(valor) {
    const res = await fetch("/api/deposit", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ amount: valor })
    });

    const data = await res.json();

    window.location.href = data.url;
}

async function registrarClique(adId) {
    await fetch("/api/clickAd", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ ad_id: adId })
    });
}

// AUTO LOGIN
if (localStorage.getItem("user")) {
    document.querySelector(".center-box").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    carregarAds();
}