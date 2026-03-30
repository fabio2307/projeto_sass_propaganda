const API = "http://localhost:3000/api";
// depois no Vercel vira automático

async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));

        document.querySelector(".center-box").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");

        carregarAds();
    } else {
        alert("Erro no login");
    }
}

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
        alert("Erro no cadastro");
    }
}

function logout() {
    localStorage.removeItem("user");
    location.reload();
}

async function carregarAds() {
    const res = await fetch(`${API}/getAds`);
    const ads = await res.json();

    const container = document.getElementById("ads");
    container.innerHTML = "";

    ads.forEach(ad => {
        container.innerHTML += `
      <div class="ad">
        <img src="${ad.image}" />
        <h4>${ad.title}</h4>
      </div>
    `;
    });
}

// AUTO LOGIN
if (localStorage.getItem("user")) {
    document.querySelector(".center-box").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    carregarAds();
}