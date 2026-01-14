/**
 * SNIFER DESKTOP UPLOADER - Versión 1.0.7
 * Modificaciones: 
 * - Soporte para tramas completas (raw_packet).
 */
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import fetch from 'node-fetch';

// CONFIGURATION
const API_URL = "https://snifer.vercel.app/api/ingest";
const BAUD_RATE = 115200;
const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 10000;

console.log("🚀 Snifer Desktop Uploader v1.0");
console.log("-------------------------------");

import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let buffer = [];
let port = null;

async function selectPort() {
    console.log("🔍 Buscando puertos seriales...");
    const ports = await SerialPort.list();

    if (ports.length === 0) {
        console.log("❌ No se encontraron puertos. Reintentando en 5s...");
        setTimeout(selectPort, 5000);
        return;
    }

    console.log("\nPuertos Disponibles:");
    ports.forEach((p, i) => {
        console.log(`[${i + 1}] ${p.path} \t ${p.manufacturer || ''} ${p.pnpId || ''}`);
    });
    console.log(`[R] Refrescar lista`);

    rl.question('\nSeleccione el número del puerto (ej: 1): ', (answer) => {
        if (answer.toLowerCase() === 'r') {
            selectPort();
            return;
        }

        const index = parseInt(answer) - 1;
        if (index >= 0 && index < ports.length) {
            connect(ports[index].path);
        } else {
            console.log("❌ Selección inválida.");
            selectPort();
        }
    });
}

function connect(path) {
    console.log(`🔌 Conectando a ${path}...`);
    port = new SerialPort({ path: path, baudRate: BAUD_RATE, autoOpen: false });

    port.open((err) => {
        if (err) {
            console.error("Error abriendo puerto:", err.message);
            console.log("Reintentando selección...");
            setTimeout(selectPort, 2000);
            return;
        }
        console.log("✅ Conectado exitosamente. Escuchando datos...");
        console.log("(Presione Ctrl+C para salir)");
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', (line) => {
        line = line.trim();
        if (!line) return;
        // Basic validation: Expecting CSV format
        if (line.split(',').length >= 4) {
            processLine(line);
        } else {
            console.log("Ignorado (formato inválido):", line);
        }
    });

    port.on('close', () => {
        console.log("⚠️ Puerto desconectado via hardware.");
        port = null;
        setTimeout(selectPort, 2000);
    });

    port.on('error', (err) => {
        console.log("Error de puerto:", err.message);
        if (port && port.isOpen) port.close();
    });
}

function processLine(line) {
    console.log("📥 Dato recibido:", line);
    const data = line.split(",");
    const [nodo, mac, rssi, fingerprint, raw_packet, ...rest] = data;

    // Parse Vendor locally if needed, or let server handle
    // For ingest API, we need: { nodo, mac, rssi, fingerprint, vendor?, raw_packet }
    // The device sends: Nodo, MAC, RSSI, Fingerprint, RawPacket

    buffer.push({
        nodo,
        mac,
        rssi,
        fingerprint,
        raw_packet: raw_packet || "",
        vendor: "Desconocido (Desktop)",
        timestamp: Date.now()
    });

    if (buffer.length >= BATCH_SIZE) {
        uploadBuffer();
    }
}

async function uploadBuffer() {
    if (buffer.length === 0) return;

    const batch = [...buffer];
    buffer = []; // Clear immediately

    console.log(`☁️ Subiendo ${batch.length} registros...`);

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch)
        });

        if (res.ok) {
            console.log("✅ Subida exitosa.");
        } else {
            console.error(`❌ Error HTTP: ${res.status}`);
            // Optional: Restore to buffer logic if mission critical
        }
    } catch (e) {
        console.error("❌ Error red:", e.message);
    }
}

// Periodic Flush
setInterval(uploadBuffer, FLUSH_INTERVAL_MS);

// Start
selectPort();
