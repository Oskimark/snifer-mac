/**
 * API INGEST - Versión 1.2.0
 * Modificaciones: 
 * - Seguimiento de Nodos: Registra estado, tipo y última actividad en la tabla 'nodes'.
 * - OUI Lookup en el servidor.
 */
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const data = req.body;

    // Validación básica
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Formato inválido. Se espera un array.' });
    }

    console.log(`[INGEST] Recibidos ${data.length} registros del Sniffer.`);

    // Estrategia híbrida: Vercel Postgres (NUBE) vs Archivo (LOCAL)
    try {
      if (process.env.POSTGRES_URL) {
        // Importación dinámica compatible con ESM
        const { sql } = await import('@vercel/postgres');

        // --- INICIALIZACIÓN DE TABLAS (Separadas para evitar errores de protocolo) ---
        try {
          await sql`CREATE TABLE IF NOT EXISTS vendors (oui VARCHAR(6) PRIMARY KEY, vendor_name VARCHAR(255));`;
          await sql`CREATE TABLE IF NOT EXISTS detections (
                id SERIAL PRIMARY KEY,
                nodo VARCHAR(50),
                mac VARCHAR(50),
                rssi INTEGER,
                fingerprint VARCHAR(50),
                vendor VARCHAR(100),
                raw_packet TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );`;
          await sql`CREATE TABLE IF NOT EXISTS nodes (
                id VARCHAR(50) PRIMARY KEY,
                lat DOUBLE PRECISION DEFAULT -34.3382,
                lng DOUBLE PRECISION DEFAULT -56.7055,
                type VARCHAR(20) DEFAULT 'mesh',
                last_seen TIMESTAMPTZ DEFAULT NOW()
            );`;
        } catch (initErr) {
          console.warn("[INGEST] Aviso en inicialización (posiblemente ya existe):", initErr.message);
        }

        // Migración: Asegurar raw_packet y TIMESTAMPTZ (opcional/silencioso)
        try {
          await sql`ALTER TABLE detections ADD COLUMN IF NOT EXISTS raw_packet TEXT;`;
          // Convertir a TIMESTAMPTZ si era TIMESTAMP (evita issues de zona horaria)
          await sql`ALTER TABLE detections ALTER COLUMN created_at TYPE TIMESTAMPTZ;`;
          await sql`ALTER TABLE nodes ALTER COLUMN last_seen TYPE TIMESTAMPTZ;`;
        } catch (e) { /* Ya migrado o sin permisos */ }

        // --- LÓGICA DE VENDORS (OUI LOOKUP) ---
        const ouis = [...new Set(data.map(d =>
          d.mac ? d.mac.replace(/:/g, '').substring(0, 6).toUpperCase() : null
        ).filter(Boolean))];

        const vendorMap = {};
        if (ouis.length > 0) {
          try {
            // Buscamos los fabricantes en la tabla 'vendors'
            const { rows } = await sql`SELECT oui, vendor_name FROM vendors WHERE oui = ANY(${ouis})`;
            rows.forEach(v => {
              vendorMap[v.oui] = v.vendor_name;
            });
          } catch (vErr) {
            console.error("[INGEST] Error consultando vendors:", vErr.message);
          }
        }

        // --- INSERCIÓN DE DATOS ---
        for (const d of data) {
          if (!d.mac || d.mac.length !== 17) continue;

          // Filtro Multicast/Broadcast (Bit 0 del primer byte)
          const firstByte = parseInt(d.mac.substring(0, 2), 16);
          if (isNaN(firstByte) || (firstByte & 0x01)) {
            continue;
          }

          const oui = d.mac.replace(/:/g, '').substring(0, 6).toUpperCase();
          const detectedVendor = vendorMap[oui] || d.vendor || 'Fabricante Desconocido';

          // Insertar Detección
          await sql`INSERT INTO detections (nodo, mac, rssi, fingerprint, vendor, raw_packet, created_at) 
                    VALUES (${d.nodo}, ${d.mac}, ${d.rssi}, ${d.fingerprint}, ${detectedVendor}, ${d.raw_packet || ''}, NOW());`;

          // Actualizar Nodo
          const nIdLower = d.nodo.toLowerCase();
          const nodeType = (nIdLower.includes('nodows') || nIdLower.includes('nodesw') || nIdLower.includes('standalone')) ? 'standalone' : 'mesh';
          await sql`INSERT INTO nodes (id, type, last_seen) 
                    VALUES (${d.nodo}, ${nodeType}, NOW())
                    ON CONFLICT (id) DO UPDATE SET 
                        type = EXCLUDED.type,
                        last_seen = NOW();`;
        }

        console.log(`[INGEST] OK: ${data.length} registros guardados en Postgres.`);
        return res.status(200).json({ success: true, mode: 'cloud' });
      }
    } catch (err) {
      console.error("[INGEST] CRASH CRÍTICO en Postgres:", err.message);
    }

    // --- FALLBACK LOCAL (Archivo CSV) ---
    // En Vercel (Lambda), solo /tmp es escribible
    const isLambda = !!process.env.VERCEL;
    const dbDir = isLambda ? '/tmp' : process.cwd();
    const dbFile = path.join(dbDir, 'captures.csv');

    // Si no existe, creamos cabecera
    if (!fs.existsSync(dbFile)) {
      fs.writeFileSync(dbFile, 'Timestamp,Nodo,MAC,RSSI,Fingerprint,Fabricante\n');
    }

    const csvLines = data.map(d =>
      `${new Date().toISOString()},${d.nodo},${d.mac},${d.rssi},${d.fingerprint},"${d.vendor || ''}"`
    ).join('\n');

    fs.appendFileSync(dbFile, csvLines + '\n');
    console.log(`   + Guardados en: ${dbFile}`);

    return res.status(200).json({ success: true, count: data.length, file: dbFile });
  }

  // Manejo de otros métodos
  res.setHeader('Allow', ['POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
