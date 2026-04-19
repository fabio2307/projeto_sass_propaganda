import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { createClient } from '@supabase/supabase-js';
import https from 'https';

// 🔥 Mapa de tentativas falhadas (em memória)
const failedAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutos

function getSupabase() {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

function getSupabaseAuth() {
    if (!process.env.SUPABASE_ANON_KEY) {
        throw new Error("SUPABASE_ANON_KEY não configurada para usar Auth do Supabase");
    }
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );
}

// 🔥 validação de email e senha
function validateCredentials(email, password) {
    if (!email || !password) return "Email e senha obrigatórios";
    // Regex mais rigoroso para email
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!emailRegex.test(email)) return "Email inválido";
    if (password.length < 8) return "Senha deve ter pelo menos 8 caracteres";
    // Verificar mix de caracteres
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    if (!hasUpper || !hasLower || !hasDigit || !hasSymbol) {
        return "Senha deve conter pelo menos uma letra maiúscula, uma minúscula, um dígito e um símbolo";
    }
    return null;
}

// 🔥 verifica se senha está vazada usando HaveIBeenPwned
async function isPasswordLeaked(password) {
    try {
        const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
        const prefix = sha1.substring(0, 5);
        const suffix = sha1.substring(5);

        return new Promise((resolve) => {
            const req = https.get(`https://api.pwnedpasswords.com/range/${prefix}`, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    const lines = data.split('\n');
                    for (const line of lines) {
                        const [hashSuffix, count] = line.split(':');
                        if (hashSuffix === suffix) {
                            resolve(parseInt(count) > 0);
                            return;
                        }
                    }
                    resolve(false);
                });
            });
            req.on('error', () => resolve(false)); // Em caso de erro, assumir não vazada
            req.setTimeout(5000, () => {
                req.destroy();
                resolve(false);
            });
        });
    } catch {
        return false; // Em caso de erro, permitir a senha
    }
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

    // Verificar se senha está vazada
    const leaked = await isPasswordLeaked(password);
    if (leaked) {
        return { success: false, error: "Esta senha foi encontrada em vazamentos de dados. Escolha uma senha diferente." };
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
            password: hash,
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
    // Verificar se conta está bloqueada
    const attempts = failedAttempts.get(email) || { count: 0, lockUntil: 0 };
    if (attempts.lockUntil > Date.now()) {
        const remaining = Math.ceil((attempts.lockUntil - Date.now()) / 60000);
        return { success: false, error: `Conta bloqueada. Tente novamente em ${remaining} minutos.` };
    }

    const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle();

    // Sempre comparar senha para evitar timing attacks
    const hash = user?.password || await hashPassword('dummy'); // dummy hash
    const match = await verifyPassword(password, hash);

    if (!user || !match) {
        // Incrementar tentativas falhadas
        attempts.count += 1;
        if (attempts.count >= MAX_ATTEMPTS) {
            attempts.lockUntil = Date.now() + LOCK_TIME;
        }
        failedAttempts.set(email, attempts);
        return { success: false, error: "Login inválido" };
    }

    // Resetar tentativas em login bem-sucedido
    failedAttempts.delete(email);

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

// 🔥 registra usuário usando Supabase Auth
async function registerUserSupabaseAuth({ name, birthDate, email, password }) {
    const validationError = validateCredentials(email, password);
    if (validationError) {
        return { success: false, error: validationError };
    }

    // Verificar se senha está vazada (mesmo com Supabase Auth, para consistência)
    const leaked = await isPasswordLeaked(password);
    if (leaked) {
        return { success: false, error: "Esta senha foi encontrada em vazamentos de dados. Escolha uma senha diferente." };
    }

    const supabaseAuth = getSupabaseAuth();

    const { data, error } = await supabaseAuth.auth.signUp({
        email,
        password,
        options: {
            data: {
                name,
                birth_date: birthDate
            }
        }
    });

    if (error) {
        return { success: false, error: error.message };
    }

    // Se precisar salvar dados adicionais na tabela users, faça aqui
    // Mas com Supabase Auth, os metadados ficam em auth.users

    return { success: true, user: data.user };
}

// 🔥 faz login usando Supabase Auth
async function loginUserSupabaseAuth({ email, password }) {
    const supabaseAuth = getSupabaseAuth();

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, token: data.session.access_token, user: data.user };
}

export {
    registerUser,
    loginUser,
    registerUserSupabaseAuth,
    loginUserSupabaseAuth,
    getUserFromToken,
    getUserData,
    validateCredentials
};