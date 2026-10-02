import mqtt, { type MqttClient } from 'mqtt';

import { MQTT_CONFIG, validateMQTTConfig } from '../config/mqtt';
import { isSensorData, type SensorData } from '../types/SensorData';

export type MQTTStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

interface MQTTCallbacks {
  onStatus?: (status: MQTTStatus) => void;
  onMessage?: (data: SensorData) => void;
  onError?: (error: Error) => void;
  onInvalidMessage?: (error: Error) => void;
}

export function connectMQTT(callbacks: MQTTCallbacks): () => void {
  let client: MqttClient | undefined;
  let disposed = false;

  const reportError = (error: Error) => {
    if (disposed) return;
    callbacks.onStatus?.('error');
    callbacks.onError?.(error);
  };

  callbacks.onStatus?.('connecting');

  try {
    validateMQTTConfig();
    client = mqtt.connect(MQTT_CONFIG.url, {
      clientId: `hub_${Math.random().toString(16).slice(2)}`,
      username: MQTT_CONFIG.username,
      password: MQTT_CONFIG.password,
      protocolVersion: 4,
      clean: true,
      keepalive: 30,
      connectTimeout: 10000,
      reconnectPeriod: 3000,
      resubscribe: false,
      forceNativeWebSocket: true,
      timerVariant: 'native',
    });

    const connection = client;

    connection.on('connect', () => {
      if (disposed) return;
      connection.subscribe(MQTT_CONFIG.topic, { qos: 1 }, (error, granted) => {
        if (disposed || !connection.connected) return;
        if (error) return reportError(error);
        if (!granted?.some((subscription) => subscription.topic === MQTT_CONFIG.topic && subscription.qos <= 2)) {
          return reportError(new Error('O broker recusou a assinatura do tópico dos sensores.'));
        }
        callbacks.onStatus?.('connected');
      });
    });

    connection.on('message', (topic, message) => {
      if (disposed || topic !== MQTT_CONFIG.topic) return;

      let data: unknown;
      try {
        data = JSON.parse(message.toString());
      } catch {
        callbacks.onInvalidMessage?.(new Error('Mensagem ignorada: o ESP32 precisa publicar JSON válido.'));
        return;
      }

      if (!isSensorData(data)) {
        callbacks.onInvalidMessage?.(new Error('Mensagem ignorada: confira os quatro campos e os tipos das leituras.'));
        return;
      }

      callbacks.onMessage?.(data);
    });

    connection.on('reconnect', () => {
      if (!disposed) callbacks.onStatus?.('reconnecting');
    });
    connection.on('close', () => {
      if (!disposed) callbacks.onStatus?.('disconnected');
    });
    connection.on('error', reportError);
  } catch (error) {
    reportError(error instanceof Error ? error : new Error(String(error)));
  }

  return () => {
    disposed = true;
    // Each screen owns its connection; cleanup also stops automatic retries.
    client?.end(true);
  };
}
