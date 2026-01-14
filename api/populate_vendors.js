/**
 * SCRIPT DE POBLADO DE VENDORS (ALTA PERFORMANCE)
 * Uso: node api/populate_vendors.js "tu_postgres_url"
 */
import fs from 'fs';
import path from 'path';

async function populate() {
    let postgresUrl = process.argv[2];

    if (!postgresUrl) {
        const envPath = path.join(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            envContent.split('\n').forEach(line => {
                const [key, ...valueParts] = line.split('=');
                if (key?.trim() === 'POSTGRES_URL') {
                    postgresUrl = valueParts.join('=').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
                }
            });
        }
    }

    if (!postgresUrl) {
        console.error("❌ Error: No se encontró POSTGRES_URL.");
        console.log("\nUso: node api/populate_vendors.js \"TU_URL_POSTGRES\"");
        process.exit(1);
    }

    process.env.POSTGRES_URL = postgresUrl;
    console.log("🚀 Iniciando poblado optimizado...");

    try {
        const { sql } = await import('@vercel/postgres');

        // 1. Asegurar tabla
        await sql`CREATE TABLE IF NOT EXISTS vendors (
            oui VARCHAR(6) PRIMARY KEY,
            vendor_name VARCHAR(255)
        );`;

        // 2. Leer archivo vendors.txt
        const filePath = path.join(process.cwd(), 'vendors.txt');
        if (!fs.existsSync(filePath)) {
            console.error("❌ No se encontró vendors.txt");
            process.exit(1);
        }

        const lines = fs.readFileSync(filePath, 'utf8').split('\n');
        console.log(`📑 Procesando ${lines.length} registros...`);

        // 3. Preparar datos
        const allVendors = [];

        // Parche manual para casos críticos
        allVendors.push({ oui: 'A49FE7', name: 'Samsung Electronics (Mobile/Node)' });
        allVendors.push({ oui: '246F28', name: 'Espressif Inc (Sensor Node)' });
        allVendors.push({ oui: 'ECFAB0', name: 'Espressif Inc' });

        for (const line of lines) {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const oui = parts[0].trim().toUpperCase();
                const name = parts.slice(1).join(',').trim().substring(0, 250);
                if (oui.length === 6) {
                    allVendors.push({ oui, name });
                }
            }
        }

        // 4. Inserción en bloques GIGANTES usando UNNEST (Mucho más rápido)
        const batchSize = 2000;
        for (let i = 0; i < allVendors.length; i += batchSize) {
            const batch = allVendors.slice(i, i + batchSize);
            const ouis = batch.map(v => v.oui);
            const names = batch.map(v => v.name);

            try {
                // UNNEST permite pasar arrays y convertirlos en filas de tabla virtual
                await sql.query(
                    `INSERT INTO vendors (oui, vendor_name)
                     SELECT * FROM UNNEST($1::text[], $2::text[])
                     ON CONFLICT (oui) DO UPDATE SET vendor_name = EXCLUDED.vendor_name`,
                    [ouis, names]
                );
                console.log(`✅ Bloque ${i} a ${Math.min(i + batchSize, allVendors.length)} completado.`);
            } catch (err) {
                console.error(`❌ Error en bloque ${i}:`, err.message);
            }
        }

        console.log("\n✨ PROCESO FINALIZADO CON ÉXITO.");
        console.log("Todas las MACs (incluyendo Samsung A4:9F:E7) deberían reconocerse ahora.");

    } catch (err) {
        console.error("❌ Fallo crítico:", err);
    }
}

populate();
