// lib/authService.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

export {
    validateCredentials,
    hashPassword,
    verifyPassword,
    generateToken,
    verifyToken,
    getUserFromToken
};