import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export default async function handler(req, res) {
    // Solo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    try {
        // Buscar usuario
        const result = await sql`
            SELECT * FROM users 
            WHERE email = ${email.toLowerCase()} AND is_active = true
        `;

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const user = result.rows[0];

        // Verificar contraseña
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Generar token de sesión
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días

        // Guardar sesión
        await sql`
            INSERT INTO sessions (user_id, session_token, expires_at) 
            VALUES (${user.id}, ${sessionToken}, ${expiresAt})
        `;

        // Actualizar last_login
        await sql`
            UPDATE users SET last_login = NOW() WHERE id = ${user.id}
        `;

        // Retornar datos de usuario (sin password)
        res.status(200).json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role
            },
            sessionToken,
            expiresAt
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}
