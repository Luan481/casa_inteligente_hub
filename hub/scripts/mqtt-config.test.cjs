/* global __dirname */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadModule(file, env = {}) {
  const source = readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, process: { env }, URL });
  return exports;
}

const cloud = {
  EXPO_PUBLIC_HIVEMQ_HOST: 'example.hivemq.cloud',
  EXPO_PUBLIC_MQTT_USERNAME: 'hub',
  EXPO_PUBLIC_MQTT_PASSWORD: 'example-test-password',
};

test('host HiveMQ gera WSS e preserva tópico padrão', () => {
  const config = loadModule('config/mqtt.ts', cloud);
  assert.equal(config.MQTT_CONFIG.url, 'wss://example.hivemq.cloud:8884/mqtt');
  assert.equal(config.MQTT_CONFIG.topic, 'casa/sensores');
  assert.doesNotThrow(config.validateMQTTConfig);
});

test('URL explícita tem prioridade e permite broker local sem credenciais', () => {
  const config = loadModule('config/mqtt.ts', {
    EXPO_PUBLIC_HIVEMQ_HOST: 'https://host-antigo-invalido',
    EXPO_PUBLIC_MQTT_URL: 'ws://192.168.0.100:8000/mqtt',
  });
  assert.equal(config.MQTT_CONFIG.url, 'ws://192.168.0.100:8000/mqtt');
  assert.doesNotThrow(config.validateMQTTConfig);
});

test('configurações incorretas são rejeitadas antes de conectar', () => {
  const invalid = [
    {},
    { ...cloud, EXPO_PUBLIC_HIVEMQ_HOST: 'https://example.hivemq.cloud' },
    { ...cloud, EXPO_PUBLIC_MQTT_PASSWORD: '' },
    { ...cloud, EXPO_PUBLIC_MQTT_USERNAME: '' },
    { ...cloud, EXPO_PUBLIC_MQTT_URL: 'mqtts://example.hivemq.cloud:8883' },
    { ...cloud, EXPO_PUBLIC_MQTT_URL: 'ws://example.hivemq.cloud:8884/mqtt' },
    { ...cloud, EXPO_PUBLIC_MQTT_URL: 'wss://example.hivemq.cloud:8883/mqtt' },
    { ...cloud, EXPO_PUBLIC_MQTT_URL: 'endereco-invalido' },
    { ...cloud, EXPO_PUBLIC_MQTT_URL: 'wss://hub:senha@example.hivemq.cloud/mqtt' },
    { ...cloud, EXPO_PUBLIC_MQTT_TOPIC: 'casa/#' },
    { ...cloud, EXPO_PUBLIC_MQTT_TOPIC: 'casa/+' },
    { ...cloud, EXPO_PUBLIC_MQTT_TOPIC: 'casa/\u0000' },
  ];
  for (const env of invalid) {
    assert.throws(loadModule('config/mqtt.ts', env).validateMQTTConfig);
  }
});

test('contrato ESP32 aceita leituras e rejeita dados incompletos ou com tipos errados', () => {
  const { isSensorData } = loadModule('types/SensorData.ts');
  const reading = { distancia: 42.5, temperatura: 25.3, umidade: 61.2, movimento: false };
  assert.equal(isSensorData(reading), true);
  assert.equal(isSensorData({ ...reading, distancia: 0, temperatura: -10, umidade: 100, movimento: true }), true);
  for (const invalid of [null, [], {}, { ...reading, temperatura: undefined },
    { ...reading, distancia: '42.5' }, { ...reading, distancia: -1 },
    { ...reading, temperatura: NaN }, { ...reading, temperatura: Infinity },
    { ...reading, umidade: 101 }, { ...reading, umidade: -1 },
    { ...reading, movimento: 1 }, { ...reading, movimento: null }]) {
    assert.equal(isSensorData(invalid), false);
  }
});
