import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        const url = process.env.POSTGRES_URL;
        if (!url) throw new Error("La variable POSTGRES_URL no está definida.");

        // Prueba simple de conexión
        const result = await sql`SELECT NOW();`;

        return res.status(200).json({
            status: 'OK',
            message: 'Conexión a Base de Datos EXITOSA',
            time: result.rows[0],
            env_check: 'Variable encontrada'
        });
    } catch (error) {
        return res.status(500).json({
            status: 'ERROR',
            message: error.message,
            stack: error.stack
        });
    }
}
