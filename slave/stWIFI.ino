/*
 * SNIFER TACTICO - MODO WIFI STANDALONE (CONFIGURABLE)
 * Versión: 1.3.0
 * Descripción: Portal cautivo para configurar WiFi, ID de Nodo y URL de API.
 * Librerías: WiFiManager (tzapu), ArduinoJson
 */
#include <ArduinoJson.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include <FS.h>
#include <LittleFS.h>
#include <WiFiManager.h>

// Parámetros por defecto
char nodeId[40] = "Nodows-001";
char serverUrl[100] = "https://snifer.vercel.app/api/ingest";
bool shouldSaveConfig = false;

String datosAcumulados = "";

// Callback para guardar configuración
void saveConfigCallback() {
  Serial.println("Debe guardarse la nueva configuración...");
  shouldSaveConfig = true;
}

void loadSettings() {
  if (LittleFS.begin()) {
    if (LittleFS.exists("/config.json")) {
      File configFile = LittleFS.open("/config.json", "r");
      if (configFile) {
        size_t size = configFile.size();
        std::unique_ptr<char[]> buf(new char[size]);
        configFile.readBytes(buf.get(), size);
        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, buf.get()) == DeserializationError::Ok) {
          strcpy(nodeId, doc["nodeId"]);
          strcpy(serverUrl, doc["serverUrl"]);
        }
      }
    }
  }
}

void saveSettings() {
  StaticJsonDocument<256> doc;
  doc["nodeId"] = nodeId;
  doc["serverUrl"] = serverUrl;
  File configFile = LittleFS.open("/config.json", "w");
  if (configFile) {
    serializeJson(doc, configFile);
    configFile.close();
  }
}

// Contadores globales para debug
unsigned long totalPackets = 0;
unsigned long probeRequests = 0;
unsigned long capturedMACs = 0;

void snifferCallback(uint8_t *buf, uint16_t len) {
  totalPackets++;

  if (len < 36)
    return;

  // Lógica del LED: Parpadeo muy rápido para indicar recepción de CUALQUIER
  // paquete
  digitalWrite(LED_BUILTIN, LOW);

  // En ESP8266 promiscuous, el payload suele empezar en el offset 12
  // buf[12] es el Frame Control byte
  uint8_t frame_control = buf[12];
  uint8_t type = (frame_control >> 2) & 0x03;
  uint8_t subtype = (frame_control >> 4) & 0x0F;

  // Filtro: Capturamos Probe Requests (Type 00, Subtype 04) -> 0x40
  // Opcional: Capturar también Data Frames (Type 02) -> 0x08 o 0x88 (QoS Data)
  bool isInteresting = (frame_control == 0x40) || (type == 0x02);

  if (isInteresting) {
    if (frame_control == 0x40)
      probeRequests++;

    uint8_t mac[6];
    // El Source MAC en marcos de Datos y Probe Requests suele estar en el mismo
    // lugar [FC:2][DUR:2][ADDR1:6][ADDR2:6] -> ADDR2 es el emisor. Offset 12+10
    // = 22
    memcpy(mac, buf + 22, 6);

    // Ignorar Multicast (Bit 0 del primer byte es 1)
    if (mac[0] & 0x01) {
      digitalWrite(LED_BUILTIN, HIGH);
      return;
    }

    int rssi = (int8_t)buf[0];
    char macStr[18];
    sprintf(macStr, "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2],
            mac[3], mac[4], mac[5]);

    // Fingerprint: Sequence Control (Offset 12+22 = 34)
    uint16_t seq = buf[34] | (buf[35] << 8);
    char fingerprint[10];
    sprintf(fingerprint, "%04X", seq);

    // Hexadecimal (Raw)
    String rawHex = "";
    int maxLen = (len > 80) ? 80 : len;
    for (int i = 0; i < maxLen; i++) {
      char hexByte[3];
      sprintf(hexByte, "%02X", buf[i]);
      rawHex += String(hexByte);
    }

    if (datosAcumulados.indexOf(macStr) == -1 &&
        datosAcumulados.length() < 2000) {
      if (datosAcumulados != "")
        datosAcumulados += ",";
      datosAcumulados += "{\"nodo\":\"" + String(nodeId) + "\",\"mac\":\"" +
                         String(macStr) + "\",\"rssi\":" + String(rssi) +
                         ",\"fingerprint\":\"" + String(fingerprint) +
                         "\",\"raw_packet\":\"" + rawHex + "\"}";
      capturedMACs++;
      Serial.printf(">>> CAPTURADA MAC: %s | RSSI: %d | Type: %02X\n", macStr,
                    rssi, frame_control);
    }
  }
  digitalWrite(LED_BUILTIN, HIGH);
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
  Serial.begin(115200);

  loadSettings();

  WiFiManager wm;
  wm.setSaveConfigCallback(saveConfigCallback);

  WiFiManagerParameter custom_node_id("nodeId", "ID de Nodo", nodeId, 40);
  WiFiManagerParameter custom_api_url("serverUrl", "URL API (Ingest)",
                                      serverUrl, 100);
  wm.addParameter(&custom_node_id);
  wm.addParameter(&custom_api_url);

  // Iniciar Portal si no hay WiFi o si se fuerza (ej: pin grounding)
  if (!wm.autoConnect("SNIFER-CONFIG")) {
    Serial.println("Fallo al conectar y tiempo agotado.");
    ESP.restart();
  }

  // Guardar si hubo cambios en el portal
  if (shouldSaveConfig) {
    strcpy(nodeId, custom_node_id.getValue());
    strcpy(serverUrl, custom_api_url.getValue());
    saveSettings();
  }

  Serial.println("\n--- SNIFER STANDALONE (v1.3.0) READY ---");
  Serial.printf("ID NODO: %s\n", nodeId);
  Serial.printf("URL API: %s\n", serverUrl);
}

void loop() {
  Serial.println(">>> MODO SNIFFER ACTIVO");
  wifi_promiscuous_enable(0);
  wifi_set_promiscuous_rx_cb(snifferCallback);
  wifi_promiscuous_enable(1);

  unsigned long start = millis();
  while (millis() - start < 30000) {
    static int ch = 1;
    static unsigned long lastCh = 0;
    if (millis() - lastCh > 150) {
      ch++;
      if (ch > 13)
        ch = 1;
      wifi_set_channel(ch);
      lastCh = millis();
    }
    delay(1);
  }

  wifi_promiscuous_enable(0);
  Serial.println(">>> ANALIZANDO CONEXIÓN...");

  // MAP-04: Asegurar conexión antes de enviar (Promiscuous puede tumbar el
  // WiFi)
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Reconectando WiFi...");
    WiFi.begin();
    int retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < 20) {
      delay(500);
      Serial.print(".");
      retries++;
    }
  }

  if (WiFi.status() == WL_CONNECTED && datosAcumulados != "") {
    digitalWrite(LED_BUILTIN, LOW);
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;

    // Si por algún motivo serverUrl quedó vacío en LittleFS, usar el default
    if (strlen(serverUrl) < 5) {
      strcpy(serverUrl, "https://snifer.vercel.app/api/ingest");
    }

    Serial.print("Enviando a: ");
    Serial.println(serverUrl);

    http.begin(client, serverUrl);
    http.addHeader("Content-Type", "application/json");

    String payload = "[" + datosAcumulados + "]";
    int httpCode = http.POST(payload);

    if (httpCode > 0) {
      Serial.printf("HTTP Code: %d\n", httpCode);
      String response = http.getString();
      Serial.println("Response: " + response);

      // Éxito: Limpiar buffer y blink rápido
      for (int i = 0; i < 5; i++) {
        digitalWrite(LED_BUILTIN, LOW);
        delay(50);
        digitalWrite(LED_BUILTIN, HIGH);
        delay(50);
      }
      datosAcumulados = "";
    } else {
      Serial.printf("Error POST: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  } else {
    if (datosAcumulados == "")
      Serial.println("Sin datos para enviar.");
    else
      Serial.println("Error: No se pudo reconectar al WiFi.");
  }

  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
}
