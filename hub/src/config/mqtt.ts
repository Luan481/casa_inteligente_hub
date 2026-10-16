// Expo replaces these direct process.env accesses when bundling the app.
const hiveMQHost = process.env.EXPO_PUBLIC_HIVEMQ_HOST?.trim() || '';
const explicitUrl = process.env.EXPO_PUBLIC_MQTT_URL?.trim() || '';

export const MQTT_CONFIG = {
  url: explicitUrl || (hiveMQHost ? `wss://${hiveMQHost}:8884/mqtt` : ''),
  topic: process.env.EXPO_PUBLIC_MQTT_TOPIC?.trim() || 'casa/sensores',
  username: process.env.EXPO_PUBLIC_MQTT_USERNAME || undefined,
  password: process.env.EXPO_PUBLIC_MQTT_PASSWORD || undefined,
};

export function validateMQTTConfig(): void {
  if (!explicitUrl && hiveMQHost && !/^[a-z0-9.-]+$/i.test(hiveMQHost)) {
    throw new Error('EXPO_PUBLIC_HIVEMQ_HOST deve conter somente o host, sem protocolo, porta ou caminho.');
  }
  if (!MQTT_CONFIG.url) {
    throw new Error('Configure o endereço do broker em .env.local e reinicie o Expo.');
  }

  let url: URL;
  try {
    url = new URL(MQTT_CONFIG.url);
  } catch {
    throw new Error('Endereço MQTT inválido. Copie a TLS WebSocket URL do painel HiveMQ para EXPO_PUBLIC_MQTT_URL.');
  }
  if (!['ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('O aplicativo precisa de um endereço MQTT via ws:// ou wss://.');
  }
  if (url.username || url.password) {
    throw new Error('Configure usuário e senha nas variáveis MQTT_USERNAME e MQTT_PASSWORD com prefixo EXPO_PUBLIC_, fora da URL.');
  }
  if (url.hostname.endsWith('.hivemq.cloud')) {
    if (url.protocol !== 'wss:' || url.port === '8883') {
      throw new Error('HiveMQ Cloud exige WSS no app. Use a TLS WebSocket URL do painel (normalmente porta 8884), não a porta MQTT 8883.');
    }
    if (!MQTT_CONFIG.username || !MQTT_CONFIG.password) {
      throw new Error('Preencha usuário e senha MQTT criados em Access Management do HiveMQ e reinicie o Expo.');
    }
  }
  if (/[+#\u0000]/.test(MQTT_CONFIG.topic)) {
    throw new Error('Configure um tópico exato para as leituras dos sensores.');
  }
}
