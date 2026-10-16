#pragma once

// Copie este arquivo para secrets.h. Nunca versione suas credenciais.
const char* WIFI_SSID = "SEU_WIFI";
const char* WIFI_PASSWORD = "SENHA_WIFI";
const char* MQTT_HOST = "SEU_CLUSTER.hivemq.cloud"; // Sem protocolo ou caminho
const unsigned short MQTT_PORT = 8883;
const bool MQTT_USE_TLS = true; // false somente para broker local de desenvolvimento
const char* MQTT_USERNAME = "esp32";
const char* MQTT_PASSWORD = "SENHA_MQTT_ESP32";
const char* MQTT_TOPIC = "casa/sensores";

// Cole aqui o certificado PEM da CA raiz que assina o certificado do broker.
// Obtenha a CA da cadeia do SEU endpoint; instruções em /HIVEMQ.md na raiz.
// O firmware recusa iniciar sem CA. Não use setInsecure().
const char* MQTT_ROOT_CA = R"PEM(
COLE_A_CA_RAIZ_PEM_AQUI
)PEM";
