import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

// 🔥 validação de email e senha
function validateCredentials(email, password) {
    if (!email || !password) return "Email e senha obrigatórios";
    // Regex mais rigoroso para email
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!emailRegex.test(email)) return "Email inválido";
    if (password.length < 8) return "Senha deve ter pelo menos 8 caracteres";
    return null;
}

// 🔥 gera hash da senha
async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

// 🔥 verifica senha
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// 🔥 gera token JWT
function generateToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '24h' });
}

// 🔥 verifica token
function verifyToken(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
}

// 🔥 obtém usuário do token
async function getUserFromToken(token) {
    if (!token) return null;
    const decoded = verifyToken(token);
    if (!decoded) return null;
    const supabase = getSupabase();
    const { data } = await supabase
        .from("users")
        .select("*")
        .eq("id", decoded.userId)
        .single();
    return data || null;
}

// 🔥 registra usuário
async function registerUser(supabase, { name, birthDate, email, password }) {
    const validationError = validateCredentials(email, password);
    if (validationError) {
        return { success: false, error: validationError };
    }

    const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

    if (existingUser) {
        return { success: false, error: "Erro ao criar conta. Tente novamente." };
    }

    const hash = await hashPassword(password);
    const token = crypto.randomUUID();
    const verifyToken = crypto.randomUUID();

    const { error } = await supabase
        .from("users")
        .insert([{
            name,
            birth_date: birthDate || null,
            email,
            password_hash: hash,
            token,
            balance: 0,
            plan: "free",
            verify_token: verifyToken,
            verified: false
        }]);

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, verifyToken };
}

// 🔥 faz login
async function loginUser(supabase, { email, password }) {
    const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle();

    // Sempre comparar senha para evitar timing attacks
    const hash = user?.password_hash || await hashPassword('dummy'); // dummy hash
    const match = await verifyPassword(password, hash);

    if (!user || !match) {
        return { success: false, error: "Login inválido" };
    }

    if (!user.verified) {
        return { success: false, error: "Verifique seu email antes de acessar" };
    }

    const newToken = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "24h" });

    await supabase
        .from("users")
        .update({ token: newToken })
        .eq("id", user.id);

    return { success: true, token: newToken, user: { id: user.id } };
}

// 🔥 obtém dados do usuário
async function getUserData(supabase, userId) {
    const { data: userData } = await supabase
        .from("users")
        .select("balance, plan")
        .eq("id", userId)
        .maybeSingle();

    return userData || { balance: 0, plan: "free" };
}

export {
    registerUser,
    loginUser,
    getUserFromToken,
    getUserData,
    validateCredentials
};