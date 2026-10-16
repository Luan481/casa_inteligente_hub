#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <time.h>
#include "secrets.h"

// Exemplo para ESP32 DevKit clássico. Confira os pinos da sua placa.
constexpr uint8_t DHT_PIN = 4;
constexpr uint8_t TRIGGER_PIN = 5;
constexpr uint8_t ECHO_PIN = 18;
constexpr uint8_t PIR_PIN = 19;
constexpr unsigned long PUBLISH_INTERVAL_MS = 5000;
constexpr unsigned long RETRY_INTERVAL_MS = 5000;

DHT dht(DHT_PIN, DHT22);
WiFiClientSecure transport;
WiFiClient localTransport;
PubSubClient mqtt(transport);
unsigned long lastPublish = 0;
unsigned long lastRetry = 0;

void setup() {
  Serial.begin(115200);
  pinMode(TRIGGER_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(PIR_PIN, INPUT);
  digitalWrite(TRIGGER_PIN, LOW);
  dht.begin();

  if (MQTT_USE_TLS && strstr(MQTT_ROOT_CA, "-----BEGIN CERTIFICATE-----") == nullptr) {
    Serial.println("Configure a CA raiz PEM em secrets.h antes de conectar.");
    while (true) delay(1000);
  }
  if (MQTT_USE_TLS) transport.setCACert(MQTT_ROOT_CA);
  else mqtt.setClient(localTransport);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(10);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  // TLS precisa de um relógio válido para verificar a validade do certificado.
  configTime(0, 0, "pool.ntp.org", "time.google.com");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED || (MQTT_USE_TLS && time(nullptr) < 1700000000)) {
    delay(50);
    return;
  }

  if (!mqtt.connected()) {
    if (millis() - lastRetry < RETRY_INTERVAL_MS) return;
    lastRetry = millis();
    String clientId = "esp32-" + WiFi.macAddress();
    if (!mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.printf("Falha MQTT: %d. Verifique rede, CA e credenciais.\n", mqtt.state());
    } else {
      Serial.println("MQTT conectado.");
    }
    return;
  }
  mqtt.loop();
  if (millis() - lastPublish < PUBLISH_INTERVAL_MS) return;
  lastPublish = millis();

  const float temperature = dht.readTemperature();
  const float humidity = dht.readHumidity();
  digitalWrite(TRIGGER_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIGGER_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIGGER_PIN, LOW);
  const unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  // Não substitua uma falha do sensor por zero ou dados fictícios.
  if (!isfinite(temperature) || !isfinite(humidity) || humidity < 0 || humidity > 100 || duration == 0) {
    Serial.println("Leitura inválida do DHT22/ultrassônico; publicação adiada.");
    return;
  }

  char payload[192];
  snprintf(payload, sizeof(payload),
    "{\"distancia\":%.1f,\"temperatura\":%.1f,\"umidade\":%.1f,\"movimento\":%s}",
    duration * 0.0343f / 2.0f, temperature, humidity,
    digitalRead(PIR_PIN) == HIGH ? "true" : "false");

  // PubSubClient publica com QoS 0. Sem retain para não entregar leitura antiga.
  if (mqtt.publish(MQTT_TOPIC, payload, false)) Serial.println(payload);
  else Serial.println("Falha ao enviar a leitura.");
}
