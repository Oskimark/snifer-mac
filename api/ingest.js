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
    let dbError = null;
    try {
      if (process.env.POSTGRES_URL) {
        // Importación dinámica compatible con ESM
        const { sql } = await import('@vercel/postgres');

        // --- INICIALIZACIÓN DE TABLAS ---
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
          console.warn("[INGEST] Warning en init:", initErr.message);
        }

        // --- LÓGICA DE VENDORS (OUI LOOKUP) ---
        const ouis = [...new Set(data.map(d =>
          d.mac ? d.mac.replace(/:/g, '').substring(0, 6).toUpperCase() : null
        ).filter(Boolean))];

        const vendorMap = {};
        if (ouis.length > 0) {
          try {
            const { rows } = await sql`SELECT oui, vendor_name FROM vendors WHERE oui = ANY(${ouis})`;
            rows.forEach(v => vendorMap[v.oui] = v.vendor_name);
          } catch (vErr) {
            console.error("[INGEST] Error vendors:", vErr.message);
          }
        }

        // --- INSERCIÓN DE DATOS ---
        let successCount = 0;
        for (const d of data) {
          try {
            if (!d.mac || d.mac.length !== 17) continue;

            // Filtro Multicast/Broadcast (Bit 0 del primer byte)
            const firstByte = parseInt(d.mac.substring(0, 2), 16);
            if (isNaN(firstByte) || (firstByte & 0x01)) continue;

            const oui = d.mac.replace(/:/g, '').substring(0, 6).toUpperCase();
            const detectedVendor = vendorMap[oui] || d.vendor || 'Fabricante Desconocido';

            // 1. Insertar Detección
            await sql`INSERT INTO detections (nodo, mac, rssi, fingerprint, vendor, raw_packet, created_at) 
                      VALUES (${d.nodo}, ${d.mac}, ${d.rssi}, ${d.fingerprint}, ${detectedVendor}, ${d.raw_packet || ''}, NOW());`;

            // 2. Actualizar Nodo
            const nIdLower = d.nodo.toLowerCase();
            const nodeType = (nIdLower.includes('nodows') || nIdLower.includes('nodesw') || nIdLower.includes('standalone')) ? 'standalone' : 'mesh';
            await sql`INSERT INTO nodes (id, type, last_seen) 
                      VALUES (${d.nodo}, ${nodeType}, NOW())
                      ON CONFLICT (id) DO UPDATE SET 
                          type = EXCLUDED.type,
                          last_seen = NOW();`;

            successCount++;
          } catch (rowErr) {
            console.error(`[INGEST] Error en registro ${d.mac}:`, rowErr.message);
            dbError = rowErr.message;
          }
        }

        if (successCount > 0) {
          return res.status(200).json({ success: true, count: successCount, mode: 'cloud', error: dbError });
        } else if (dbError) {
          throw new Error(dbError);
        }
      }
    } catch (err) {
      console.error("[INGEST] CRASH:", err.message);
      dbError = err.message;
    }

    // --- FALLBACK LOCAL (Archivo CSV) ---
    // En Vercel (Lambda), solo /tmp es escribible
    const isLambda = !!process.env.VERCEL;
    const dbDir = isLambda ? '/tmp' : process.cwd();
    const dbFile = path.join(dbDir, 'captures.csv');

    try {
      // Si no existe, creamos cabecera
      if (!fs.existsSync(dbFile)) {
        fs.writeFileSync(dbFile, 'Timestamp,Nodo,MAC,RSSI,Fingerprint,Fabricante\n');
      }
      const csvLines = data.map(d => `${new Date().toISOString()},${d.nodo},${d.mac},${d.rssi},${d.fingerprint},"${d.vendor || ''}"`).join('\n');
      fs.appendFileSync(dbFile, csvLines + '\n');
      return res.status(200).json({ success: true, count: data.length, mode: 'local', error: dbError });
    } catch (fErr) {
      return res.status(500).json({ success: false, error: dbError || fErr.message });
    }
  }

  // Manejo de otros métodos
  res.setHeader('Allow', ['POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
