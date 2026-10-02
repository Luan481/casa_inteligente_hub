export const MQTT_CONFIG = {
  url: process.env.EXPO_PUBLIC_MQTT_URL?.trim() || '',
  topic: process.env.EXPO_PUBLIC_MQTT_TOPIC?.trim() || 'casa/sensores',
  username: process.env.EXPO_PUBLIC_MQTT_USERNAME || undefined,
  password: process.env.EXPO_PUBLIC_MQTT_PASSWORD || undefined,
};

export function validateMQTTConfig(): void {
  if (!MQTT_CONFIG.url) {
    throw new Error('Configure o endereço do broker em .env.local e reinicie o Expo.');
  }

  const url = new URL(MQTT_CONFIG.url);
  if (!['ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('O aplicativo precisa de um endereço MQTT via ws:// ou wss://.');
  }
  if (/[+#]/.test(MQTT_CONFIG.topic)) {
    throw new Error('Configure um tópico exato para as leituras dos sensores.');
  }
}
