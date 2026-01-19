import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    const { node, page = 1, limit = 50 } = req.query;

    if (!node) {
        return res.status(400).json({ error: 'Parámetro node requerido' });
    }

    const offset = (page - 1) * limit;

    try {
        // Obtener lista de MACs únicas en este nodo, paginadas por última aparición
        // Nota: Es pesado. Optimizamos buscando MACs distintas primero.

        // Query Principal: MACs únicas en este nodo
        const macsRes = await sql`
            SELECT 
                mac, 
                MAX(created_at) as last_seen_in_node,
                COUNT(*) as count_in_node,
                (ARRAY_AGG(rssi ORDER BY created_at DESC))[1] as last_rssi
            FROM detections 
            WHERE nodo = ${node}
            GROUP BY mac
            ORDER BY last_seen_in_node DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        // Para cada MAC encontrada, necesitamos stats globales (Total Global y Lista de Nodos)
        // Hacemos esto en paralelo
        const enrichedRows = await Promise.all(macsRes.rows.map(async (row) => {
            const mac = row.mac;

            // Stats Globales
            const globalRes = await sql`
                SELECT 
                    COUNT(*) as total_global,
                    ARRAY_AGG(DISTINCT nodo) as nodes_list
                FROM detections
                WHERE mac = ${mac}
            `;

            const globalData = globalRes.rows[0];

            return {
                mac: row.mac,
                signal: row.last_rssi,
                date: row.last_seen_in_node,
                count_node: parseInt(row.count_in_node),
                count_total: parseInt(globalData.total_global),
                nodes_list: globalData.nodes_list || []
            };
        }));

        // TotalCount para paginación (Unique MACs count)
        const countRes = await sql`
            SELECT COUNT(DISTINCT mac) as total
            FROM detections
            WHERE nodo = ${node}
        `;
        const totalItems = parseInt(countRes.rows[0].total);

        return res.status(200).json({
            data: enrichedRows,
            total: totalItems,
            page: parseInt(page),
            limit: parseInt(limit)
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error obteniendo detalles del nodo' });
    }
}
