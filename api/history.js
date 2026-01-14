import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        const { mac, page = 1, limit = 50, search = '' } = req.query;

        // Offset para paginación
        const offset = (page - 1) * limit;

        if (mac) {
            const macStr = String(mac).trim();
            // Modo Clásico: Historial completo para una MAC específica (para tracking)
            const { rows } = await sql`
                SELECT nodo, rssi, created_at 
                FROM detections 
                WHERE mac = ${macStr}
                ORDER BY created_at ASC
                LIMIT 1000;
            `;
            return res.status(200).json(rows);
        }

        // Modo Registros: Búsqueda general paginada
        let query;
        let countQuery;

        if (search) {
            const searchPattern = `%${search}%`;
            // Consulta de datos
            query = sql`
                SELECT * FROM detections 
                WHERE mac ILIKE ${searchPattern} OR vendor ILIKE ${searchPattern}
                ORDER BY created_at DESC
                LIMIT ${limit} OFFSET ${offset};
            `;
            // Consulta de conteo total
            countQuery = sql`
                SELECT COUNT(*) FROM detections 
                WHERE mac ILIKE ${searchPattern} OR vendor ILIKE ${searchPattern};
            `;
        } else {
            // Sin búsqueda, solo paginación
            query = sql`
                SELECT * FROM detections 
                ORDER BY created_at DESC
                LIMIT ${limit} OFFSET ${offset};
            `;
            countQuery = sql`SELECT COUNT(*) FROM detections;`;
        }

        const [dataResult, countResult] = await Promise.all([query, countQuery]);

        const total = countResult.rows[0] ? parseInt(countResult.rows[0].count) : 0;

        return res.status(200).json({
            data: dataResult.rows,
            total: total,
            page: parseInt(page),
            limit: parseInt(limit)
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
