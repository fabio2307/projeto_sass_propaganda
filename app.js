const API = window.location.origin + "/api";

// LOGIN
async function login() {
    const email = emailEl().value;
    const password = passwordEl().value;

    const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.user && data.token) {
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("token", data.token);
        location.reload();
    } else {
        alert(data.error);
    }
}

function emailEl() { return document.getElementById("email"); }
function passwordEl() { return document.getElementById("password"); }

// REGISTER
async function register() {
    const res = await fetch(`${API}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: emailEl().value,
            password: passwordEl().value
        })
    });

    const data = await res.json();
    alert(data.user ? "Conta criada!" : data.error);
}

// LOGOUT
function logout() {
    localStorage.clear();
    location.reload();
}

// CRIAR AD
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
        carregarAds();
    } else {
        alert(data.error);
    }
}

// CARREGAR ADS (SEM NULL ERROR)
async function carregarAds() {

    const container = document.getElementById("ads");
    if (!container) return; // 🔥 evita erro

    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user"));

    const res = await fetch(`${API}/getAds`, {
        headers: { "Authorization": `Bearer ${token}` }
    });

    const data = await res.json();

    container.innerHTML = "";

    const meusAds = data.filter(ad => ad.user_id === user.id);

    let clicks = 0, views = 0;

    meusAds.forEach(ad => {

        clicks += ad.clicks || 0;
        views += ad.views || 0;

        const div = document.createElement("div");
        div.className = "ad-card";

        div.innerHTML = `
            <h3>${ad.title}</h3>
            <p>${ad.description}</p>

            <a href="${ad.link}" target="_blank">
                🔗 Ver produto
            </a>

            <div class="ad-metrics">
                <span>👁 ${ad.views || 0}</span>
                <span>🖱 ${ad.clicks || 0}</span>
                <span>💰 ${ad.bid}</span>
            </div>
        `;

        container.appendChild(div);
    });

    document.getElementById("totalAds").innerText = meusAds.length;
    document.getElementById("totalClicks").innerText = clicks;
    document.getElementById("totalViews").innerText = views;
}

// AUTO LOGIN
if (localStorage.getItem("user")) {
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    carregarAds();
}