import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.env.local', import.meta.url));
if (existsSync(target)) {
  console.log('next/.env.local já existe e foi preservado.');
} else {
  const source = new URL('../../hub/.env.local', import.meta.url);
  if (!existsSync(source)) throw new Error('Configure hub/.env.local ou copie next/.env.example para next/.env.local.');
  const app = parseEnv(readFileSync(source, 'utf8'));
  const keys = ['MQTT_URL', 'HIVEMQ_HOST', 'MQTT_TOPIC', 'MQTT_USERNAME', 'MQTT_PASSWORD'];
  const lines = keys.map((key) => {
    const value = app[`EXPO_PUBLIC_${key}`] ?? '';
    if (/[\r\n"]/.test(value)) throw new Error(`Configure NEXT_PUBLIC_${key} manualmente: valor com aspas ou quebra de linha.`);
    return `NEXT_PUBLIC_${key}="${value.replaceAll('$', '\\$')}"`;
  });
  writeFileSync(target, '# Configuração importada do app. Não versionar.\n' + lines.join('\n') + '\nNEXT_PUBLIC_SENSOR_MODE=real\n', { flag: 'wx' });
  console.log('next/.env.local criado com a configuração do app; credenciais não foram exibidas.');
}
