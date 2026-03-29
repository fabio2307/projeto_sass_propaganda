import { supabase } from "./lib/supabase";
import { supabaseClient } from '../lib/supabase.js';

window.supabaseClient = supabaseClient;

const btnLogin = document.getElementById("btnLogin");
const btnRegister = document.getElementById("btnRegister");

btnLogin.addEventListener("click", async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) return alert(error.message);

    alert("Logado!");
});

btnRegister.addEventListener("click", async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const { error } = await supabase.auth.signUp({
        email,
        password
    });

    if (error) return alert(error.message);

    alert("Conta criada!");
});