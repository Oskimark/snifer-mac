/**
 * API STATS - Versión 1.2.2
 * Agregación de datos históricos para nodos y dispositivos.
 */
import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    const { type, id, mac } = req.query;

    try {
        if (type === 'node' && id) {
            // Estadísticas del Nodo: Total e historial de 1 hora
            const totalRes = await sql`SELECT COUNT(*) as total FROM detections WHERE nodo = ${id}`;
            const lastHourRes = await sql`SELECT COUNT(*) as recent FROM detections WHERE nodo = ${id} AND created_at > NOW() - INTERVAL '1 hour'`;

            return res.status(200).json({
                total: parseInt(totalRes.rows[0].total),
                last_hour: parseInt(lastHourRes.rows[0].recent)
            });
        }

        if (type === 'mac' && mac) {
            // Estadísticas de la MAC: Total y desglose por Nodo
            const totalRes = await sql`SELECT COUNT(*) as total FROM detections WHERE mac = ${mac}`;
            const breakdownRes = await sql`SELECT nodo, COUNT(*) as count FROM detections WHERE mac = ${mac} GROUP BY nodo ORDER BY count DESC`;

            return res.status(200).json({
                total: parseInt(totalRes.rows[0].total),
                breakdown: breakdownRes.rows.map(r => ({
                    nodo: r.nodo,
                    count: parseInt(r.count)
                }))
            });
        }

        return res.status(400).json({ error: 'Parámetros inválidos' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error procesando estadísticas' });
    }
}
