#include "painlessMesh.h"

// --- CONFIGURACIÓN DE LA RED MESH ---
#define   MESH_PREFIX     "SNIFFER_TACTICO" // Nombre de la red interna
#define   MESH_PASSWORD   "mypassword"      // Contraseña de la red interna
#define   MESH_PORT       5555              // Puerto de comunicación
#define   MESH_CHANNEL    1                 // CANAL FIJO (Muy importante)

painlessMesh  mesh;

// Función que se ejecuta cuando llega un mensaje de un nodo esclavo
void receivedCallback( uint32_t from, String &msg ) {
  // El mensaje llega en formato: "ID_NODO,MAC,RSSI,FINGERPRINT"
  // Simplemente lo imprimimos por Serial para que lo lea Vercel
  Serial.println(msg);
}

void newConnectionCallback(uint32_t nodeId) {
    // Solo para monitoreo en consola: saber si un nodo se unió a la malla
    // Serial.printf("--> Nueva conexión, nodeId = %u\n", nodeId);
}

void setup() {
  Serial.begin(115200);

  // Configuración de la malla
  mesh.setDebugMsgTypes( ERROR | STARTUP );  // Solo mostrar errores críticos
  
  // Inicializar la malla en el canal 1
  mesh.init( MESH_PREFIX, MESH_PASSWORD, MESH_PORT, WIFI_AP_STA, MESH_CHANNEL );
  
  // Asignar funciones de respuesta
  mesh.onReceive(&receivedCallback);
  mesh.onNewConnection(&newConnectionCallback);

  // Serial.println("MAESTRO INICIALIZADO - ESPERANDO NODOS...");
}

void loop() {
  mesh.update(); // Mantiene la comunicación viva
}