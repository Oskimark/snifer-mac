import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
        return res.status(401).json({ error: 'No autenticado' });
    }

    try {
        // Buscar sesión válida
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

        res.status(200).json({
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}
