import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        // Obtenemos la lista de nodos base
        const { rows: nodes } = await sql`SELECT * FROM nodes ORDER BY id ASC`;

        // Para cada nodo, calculamos las estadísticas solicitadas
        // Esto podría optimizarse en una sola query compleja, pero por claridad y volumen de datos (pocos nodos) lo haremos iterativo
        const statsPromises = nodes.map(async (node) => {
            const nodeId = node.id;

            // 1. Total Count
            const totalRes = await sql`SELECT COUNT(*) FROM detections WHERE nodo = ${nodeId}`;
            const total = parseInt(totalRes.rows[0].count);

            // 2. Diario (Últimas 24hs)
            const dailyRes = await sql`SELECT COUNT(*) FROM detections WHERE nodo = ${nodeId} AND created_at > NOW() - INTERVAL '24 hours'`;
            const daily = parseInt(dailyRes.rows[0].count);

            // 3. Última Hora
            const lastHourRes = await sql`SELECT COUNT(*) FROM detections WHERE nodo = ${nodeId} AND created_at > NOW() - INTERVAL '1 hour'`;
            const lastHour = parseInt(lastHourRes.rows[0].count);

            // 4. Max (Pico de tráfico horario)
            // Buscamos la hora con más detecciones en la historia
            const maxRes = await sql`
                SELECT date_trunc('hour', created_at) as hour_bucket, COUNT(*) as count 
                FROM detections 
                WHERE nodo = ${nodeId} 
                GROUP BY hour_bucket 
                ORDER BY count DESC 
                LIMIT 1
            `;
            const max = maxRes.rows.length > 0 ? {
                value: parseInt(maxRes.rows[0].count),
                timestamp: maxRes.rows[0].hour_bucket
            } : { value: 0, timestamp: null };

            // 5. Estado (Basado en si hubo actividad reciente, ej: 5 min)
            // Ojeando created_at más reciente
            const lastSeenRes = await sql`SELECT MAX(created_at) as last_seen FROM detections WHERE nodo = ${nodeId}`;
            const lastSeen = lastSeenRes.rows[0].last_seen ? new Date(lastSeenRes.rows[0].last_seen) : null;
            const isOnline = lastSeen && (new Date() - lastSeen) < 5 * 60 * 1000; // 5 minutos timeout

            return {
                id: node.id,
                alias: node.alias,
                lat: node.lat,
                lng: node.lng,
                status: isOnline ? 'online' : 'offline',
                last_seen: lastSeen,
                stats: {
                    total,
                    daily,
                    last_hour: lastHour,
                    max
                }
            };
        });

        const nodesWithStats = await Promise.all(statsPromises);

        return res.status(200).json(nodesWithStats);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error calculando estadísticas de nodos' });
    }
}
