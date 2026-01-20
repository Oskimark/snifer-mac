import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
        return res.status(400).json({ error: 'No session token provided' });
    }

    try {
        // Eliminar sesión
        await sql`
            DELETE FROM sessions WHERE session_token = ${sessionToken}
        `;

        res.status(200).json({ success: true, message: 'Logout exitoso' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}
