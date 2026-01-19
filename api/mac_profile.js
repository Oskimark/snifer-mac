import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    // --- POST: UPDATE ALIAS ---
    if (req.method === 'POST') {
        const { id, alias } = req.body;
        if (!id || !alias) return res.status(400).json({ error: 'Faltan datos' });

        try {
            await sql`
                INSERT INTO mac_aliases (mac, alias, updated_at)
                VALUES (${id}, ${alias}, NOW())
                ON CONFLICT (mac) 
                DO UPDATE SET alias = ${alias}, updated_at = NOW();
            `;
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error actualizando alias' });
        }
    }

    // --- GET: PROFILE DATA ---
    const { mac, date } = req.query; // date (YYYY-MM-DD) opcional para drill-down

    if (!mac) {
        return res.status(400).json({ error: 'Parámetro MAC requerido' });
    }

    try {
        const macStr = String(mac).trim();

        // 1. Datos Generales + Alias
        const generalRes = await sql`
            SELECT 
                d.vendor,
                MIN(d.created_at) as first_seen,
                MAX(d.created_at) as last_seen,
                COUNT(*) as total_detections,
                a.alias
            FROM detections d
            LEFT JOIN mac_aliases a ON d.mac = a.mac
            WHERE d.mac = ${macStr}
            GROUP BY d.vendor, a.alias
        `;
        const general = generalRes.rows[0] || {};

        let hourlyActivity = new Array(24).fill(0);
        let dailyActivity = [];

        if (date) {
            // --- DRILL-DOWN MODE: Actividad por hora para UNA FECHA específica ---
            const histogramRes = await sql`
                SELECT 
                    EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') as hour_of_day,
                    COUNT(*) as count
                FROM detections
                WHERE mac = ${macStr}
                AND DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = ${date}
                GROUP BY hour_of_day
                ORDER BY hour_of_day ASC
            `;
            histogramRes.rows.forEach(r => {
                hourlyActivity[parseInt(r.hour_of_day)] = parseInt(r.count);
            });

        } else {
            // --- GENERAL MODE: Promedio Histórico + Histograma de Días ---

            // 2. Histograma Horario (Global)
            const histogramRes = await sql`
                SELECT 
                    EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') as hour_of_day,
                    COUNT(*) as count
                FROM detections
                WHERE mac = ${macStr}
                GROUP BY hour_of_day
                ORDER BY hour_of_day ASC
            `;
            histogramRes.rows.forEach(r => {
                hourlyActivity[parseInt(r.hour_of_day)] = parseInt(r.count);
            });

            // 3. Actividad Diaria (Últimos 30 días)
            const dailyRes = await sql`
                SELECT 
                    TO_CHAR(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') as day,
                    COUNT(*) as count
                FROM detections
                WHERE mac = ${macStr}
                AND created_at > NOW() - INTERVAL '30 days'
                GROUP BY day
                ORDER BY day ASC
            `;
            dailyActivity = dailyRes.rows.map(r => ({
                date: r.day,
                count: parseInt(r.count)
            }));
        }

        // 4. Top Nodos
        const topNodesRes = await sql`
            SELECT 
                n.id as node, 
                n.alias as node_alias,
                COUNT(d.*) as count,
                MAX(d.created_at) as last_seen_at_node
            FROM detections d
            LEFT JOIN nodes n ON d.nodo = n.id
            WHERE d.mac = ${macStr}
            GROUP BY n.id, n.alias
            ORDER BY count DESC
            LIMIT 5
        `;

        return res.status(200).json({
            mac: macStr,
            alias: general.alias || null,
            vendor: general.vendor || 'Desconocido',
            first_seen: general.first_seen,
            last_seen: general.last_seen,
            total_detections: parseInt(general.total_detections || 0),
            hourly_activity: hourlyActivity,
            daily_activity: dailyActivity, // Vacío si es drill-down
            top_nodes: topNodesRes.rows.map(r => ({
                node: r.node,
                alias: r.node_alias,
                count: parseInt(r.count),
                last_seen: r.last_seen_at_node
            }))
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error generando perfil de MAC' });
    }
}
