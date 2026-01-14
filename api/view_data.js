import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        // Consultar últimos 50 registros
        const { rows } = await sql`SELECT * FROM detections ORDER BY created_at DESC LIMIT 50;`;

        // Generar HTML simple
        const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Inspector de Datos Snifer</title>
        <style>
            body { font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #1e293b; }
            th, td { padding: 10px; border: 1px solid #334155; text-align: left; }
            th { background: #334155; color: #38bdf8; }
            tr:nth-child(even) { background: #243045; }
            h1 { color: #38bdf8; }
            .badge { background: #22c55e; color: black; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
        </style>
    </head>
    <body>
        <h1>🗄️ Últimas Capturas en Base de Datos</h1>
        <p>Mostrando los 50 registros más recientes.</p>
        <a href="/" style="color: #38bdf8">← Volver al Dashboard</a>
        
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Hora (Nube)</th>
                    <th>Nodo</th>
                    <th>MAC</th>
                    <th>RSSI</th>
                    <th>Fingerprint</th>
                    <th>Fabricante</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                <tr>
                    <td>${row.id}</td>
                    <td>${new Date(row.created_at).toLocaleString()}</td>
                    <td><span class="badge">${row.nodo}</span></td>
                    <td>${row.mac}</td>
                    <td>${row.rssi}</td>
                    <td><code>${row.fingerprint}</code></td>
                    <td>${row.vendor || '-'}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </body>
    </html>
    `;

        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(html);

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
