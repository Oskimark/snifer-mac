import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        // Obtener lista de MACs únicas con su fabricante, hora de última visualización y cantidad de nodos distintos que la vieron
        const { rows } = await sql`
        SELECT mac, vendor, MAX(created_at) as last_seen, COUNT(DISTINCT nodo) as node_count
        FROM detections 
        GROUP BY mac, vendor 
        ORDER BY last_seen DESC 
        LIMIT 1000;
    `;
        return res.status(200).json(rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
