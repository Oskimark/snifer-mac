/**
 * API NODES - Versión 1.2.0
 * Gestión de ubicación y estado de los sensores.
 */
import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            const { rows } = await sql`SELECT * FROM nodes ORDER BY id ASC`;
            return res.status(200).json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error cargando nodos' });
        }
    }

    if (req.method === 'POST') {
        const { id, lat, lng } = req.body;
        if (!id || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }

        try {
            await sql`UPDATE nodes SET lat = ${lat}, lng = ${lng} WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error actualizando ubicación' });
        }
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
}
