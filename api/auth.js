import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export default async function handler(req, res) {
    const { action } = req.query;

    // LOGIN
    if (action === 'login' && req.method === 'POST') {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña requeridos' });
        }

        try {
            const result = await sql`
                SELECT * FROM users 
                WHERE email = ${email.toLowerCase()} AND is_active = true
            `;

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Credenciales inválidas' });
            }

            const user = result.rows[0];
            const validPassword = await bcrypt.compare(password, user.password_hash);

            if (!validPassword) {
                return res.status(401).json({ error: 'Credenciales inválidas' });
            }

            const sessionToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            await sql`
                INSERT INTO sessions (user_id, session_token, expires_at) 
                VALUES (${user.id}, ${sessionToken}, ${expiresAt})
            `;

            await sql`UPDATE users SET last_login = NOW() WHERE id = ${user.id}`;

            return res.status(200).json({
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
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    // LOGOUT
    if (action === 'logout' && req.method === 'POST') {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            return res.status(400).json({ error: 'No session token provided' });
        }

        try {
            await sql`DELETE FROM sessions WHERE session_token = ${sessionToken}`;
            return res.status(200).json({ success: true, message: 'Logout exitoso' });
        } catch (error) {
            console.error('Logout error:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    // SESSION CHECK
    if (action === 'session' && req.method === 'GET') {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        try {
            const result = await sql`
                SELECT u.id, u.email, u.username, u.role, s.expires_at
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.session_token = ${sessionToken} 
                AND s.expires_at > NOW() 
                AND u.is_active = true
            `;

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Sesión inválida o expirada' });
            }

            const session = result.rows[0];

            return res.status(200).json({
                user: {
                    id: session.id,
                    email: session.email,
                    username: session.username,
                    role: session.role
                },
                expiresAt: session.expires_at
            });
        } catch (error) {
            console.error('Session check error:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    return res.status(400).json({ error: 'Invalid action' });
}
