import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(relative, overrides = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require: (name) => name in overrides ? overrides[name] : require(name), setInterval, clearInterval, URL, process });
  return exports;
}
const contract = load('../src/types/SensorData.ts');
const simulation = load('../src/services/sensorSimulation.ts');
const valid = { distancia: 42.5, temperatura: 25.3, umidade: 61.2, movimento: false };

test('contrato aceita o firmware e rejeita tipos, campos e limites inválidos', () => {
  assert.equal(contract.isSensorData(valid), true);
  for (const value of [null, {}, [], { ...valid, distancia: -1 }, { ...valid, temperatura: NaN }, { ...valid, temperatura: Infinity }, { ...valid, umidade: 101 }, { ...valid, umidade: -1 }, { ...valid, movimento: 1 }, { ...valid, distancia: '42' }]) {
    assert.equal(contract.isSensorData(value), false);
  }
});

test('simulação produz mensagens válidas, variadas e ambos os estados de movimento', () => {
  const readings = Array.from({ length: 100 }, (_, i) => simulation.createSimulatedSensorData(i));
  assert.ok(readings.every(contract.isSensorData));
  assert.ok(readings.some((value) => value.movimento));
  assert.ok(readings.some((value) => !value.movimento));
  assert.ok(new Set(readings.map((value) => value.temperatura)).size > 10);
});

function connection(granted = [{ topic: 'casa/sensores', qos: 1 }]) {
  const client = new EventEmitter();
  client.connected = true;
  client.subscribe = (topic, options, callback) => callback(null, granted);
  client.end = () => { client.ended = true; };
  const service = load('../src/services/mqtts.ts', {
    mqtt: { connect: () => client },
    '../config/mqtt': { MQTT_CONFIG: { url: 'ws://localhost:9001', topic: 'casa/sensores' }, validateMQTTConfig() {} },
    '../types/SensorData': contract,
  });
  return { client, service };
}

test('MQTT exige assinatura aprovada, filtra tópico e descarta JSON inválido sem substituir dados', () => {
  const { client, service } = connection();
  const readings = []; const statuses = []; const errors = [];
  const stop = service.connectMQTT({ onStatus: (v) => statuses.push(v), onMessage: (v) => readings.push(v), onInvalidMessage: (v) => errors.push(v) });
  client.emit('connect');
  assert.equal(statuses.at(-1), 'connected');
  client.emit('message', 'casa/sensores', Buffer.from(JSON.stringify(valid)));
  client.emit('message', 'outro/topico', Buffer.from(JSON.stringify(valid)));
  client.emit('message', 'casa/sensores', Buffer.from('{'));
  client.emit('message', 'casa/sensores', Buffer.from('{"temperatura":22}'));
  assert.equal(readings.length, 1);
  assert.equal(readings[0].distancia, 42.5);
  assert.equal(errors.length, 2);
  stop();
  assert.equal(client.ended, true);
  client.emit('message', 'casa/sensores', Buffer.from(JSON.stringify(valid)));
  assert.equal(readings.length, 1);
});

test('assinatura negada não é apresentada como conexão estabelecida', () => {
  const { client, service } = connection([{ topic: 'casa/sensores', qos: 128 }]);
  const statuses = []; const errors = [];
  const stop = service.connectMQTT({ onStatus: (v) => statuses.push(v), onError: (v) => errors.push(v) });
  client.emit('connect');
  assert.equal(statuses.at(-1), 'error');
  assert.equal(statuses.includes('connected'), false);
  assert.equal(errors.length, 1);
  stop();
});
