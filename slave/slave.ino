/*
 * SNIFER TACTICO - MODO ESCLAVO
 * Versión: 1.0.9
 * Modificaciones:
 * - Captura desde byte 0 (incluye metadatos RxControl compatibles con visor
 * avanzado).
 * - Diagnóstico por Hardware (LED Feedback):
 *   - MAC Detectada: Flash corto.
 *   - Buscando Mesh: Fijo Encendido.
 *   - Transmitiendo: Parpadeo rápido.
 *   - Sniffing: Apagado.
 */
#include "painlessMesh.h"
#include <ESP8266WiFi.h>

const String NODE_ID = "N-001";
#define MESH_PREFIX "SNIFFER_TACTICO"
#define MESH_PASSWORD "mypassword"
#define MESH_PORT 5555
#define MESH_CHANNEL 1

painlessMesh mesh;
String datosAcumulados = "";
unsigned long timerModo = 0;
bool modoMesh = false;

void snifferCallback(uint8_t *buf, uint16_t len) {
  if (modoMesh)
    return;

  // ESTRUCTURA ESP8266 PROMISCUOUS BUFFER:
  // Bytes 0-11: RxControl (Metadata, byte 0 es RSSI)
  // Byte 12: Inicio Frame 802.11 (Frame Control)

  // 1. Validar longitud mínima (Header 12 + Frame Header 24 = 36)
  if (len < 36)
    return;

  // Feedback Visual: Flash Corto (Lógica Inversa: LOW = ON)
  digitalWrite(LED_BUILTIN, LOW);

  // 2. Extraer Frame Control (Byte 12)
  uint8_t frame_control = buf[12];

  // 3. Filtro: Probe Request es 0x40
  if (frame_control == 0x40) {

    // 4. Extraer Source MAC
    // En Probe Request: [FC(2)] [DUR(2)] [DEST(6)] [SRC(6)] ...
    // SRC empieza en: Offset 12 (Inicio Frame) + 10 (Dentro Frame) = Index 22
    uint8_t mac[6];
    memcpy(mac, buf + 22, 6);

    // Validador de MAC Real (Unicast)
    // Bit 0 del primer byte debe ser 0. (Ej: 02:.. OK, 03:.. Multicast/Bad)
    if (mac[0] & 0x01)
      return;

    // 5. Extraer RSSI (Byte 0, firmado)
    int rssi = (int8_t)buf[0];

    // 6. Generar String MAC
    char macStr[18];
    sprintf(macStr, "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2],
            mac[3], mac[4], mac[5]);

    // 7. Fingerprint (Sequence Control: Index 12 + 22 = 34)
    uint16_t seq = buf[34] | (buf[35] << 8);
    char fingerprint[10];
    sprintf(fingerprint, "%04X", seq);

    // 8. Captura de Paquete Completo (Hexadecimal)
    // Capturamos desde Byte 0 para incluir metadatos de radio (RadioTap Header
    // sim)
    String rawHex = "";
    int maxLen = (len > 76) ? 76 : len; // 12 (meta) + 64 (frame) = 76 bytes
    for (int i = 0; i < maxLen; i++) {
      char hexByte[3];
      sprintf(hexByte, "%02X", buf[i]);
      rawHex += String(hexByte);
    }

    // Envío al buffer (Añadimos campo Raw)
    if (datosAcumulados.indexOf(macStr) == -1 &&
        datosAcumulados.length() < 1200) {
      datosAcumulados += NODE_ID + "," + String(macStr) + "," + String(rssi) +
                         "," + String(fingerprint) + "," + rawHex + "\n";
      // Debug opcional en Serial si está conectado USB
      Serial.printf("CAPTURA [%s]: %s (%d) [#%s]\n", NODE_ID.c_str(), macStr,
                    rssi, fingerprint);
    }
  }
  digitalWrite(LED_BUILTIN, HIGH); // Apagar LED tras procesar
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW); // ON while starting
  Serial.begin(115200);
  // Inicialización limpia
  WiFi.mode(WIFI_STA);
  wifi_promiscuous_enable(0);
  wifi_set_promiscuous_rx_cb(snifferCallback);
  wifi_promiscuous_enable(1);
  timerModo = millis();
  Serial.println("\n--- ESCLAVO INICIADO: MODO SNIFFER ---");
}

void loop() {
  unsigned long ahora = millis();

  if (!modoMesh) {
    // --- MODO SNIFFER (20 segundos) ---
    digitalWrite(LED_BUILTIN, HIGH); // LED OFF during sniffing

    if (ahora - timerModo > 20000) {
      Serial.println(">>> REINICIANDO RADIO PARA MODO MESH...");
      digitalWrite(LED_BUILTIN, LOW); // LED ON while searching/connecting
      wifi_promiscuous_enable(0);
      WiFi.disconnect();
      delay(100);

      mesh.init(MESH_PREFIX, MESH_PASSWORD, MESH_PORT, WIFI_AP_STA,
                MESH_CHANNEL);
      modoMesh = true;
      timerModo = ahora;
    }

    // Salto de canales
    static unsigned long lastCh = 0;
    if (ahora - lastCh > 150) {
      static int ch = 1;
      ch++;
      if (ch > 13)
        ch = 1;
      wifi_set_channel(ch);
      lastCh = ahora;
    }
  } else {
    // --- MODO MESH (Persistencia hasta conectar) ---
    mesh.update();

    // Si hay nodos conectados o logramos enviar
    if (mesh.getNodeList().size() > 0 && datosAcumulados != "") {
      // Feedback Visual: Blink rápido al transmitir
      for (int i = 0; i < 3; i++) {
        digitalWrite(LED_BUILTIN, LOW);
        delay(30);
        digitalWrite(LED_BUILTIN, HIGH);
        delay(30);
      }

      if (mesh.sendBroadcast(datosAcumulados)) {
        Serial.println(">>> DATOS ENVIADOS CON ÉXITO AL MAESTRO.");
        datosAcumulados = "";
      }
    }

    // Tras 15 segundos en modo Mesh, volvemos a Sniffer sí o sí
    if (ahora - timerModo > 15000) {
      Serial.println(">>> REINICIANDO RADIO PARA MODO SNIFFER...");
      mesh.stop(); // Detenemos la malla completamente
      delay(100);
      WiFi.mode(WIFI_STA);
      wifi_promiscuous_enable(1);
      modoMesh = false;
      timerModo = ahora;
    }
  }
}