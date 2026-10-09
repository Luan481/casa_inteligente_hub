#!/usr/bin/env node

// Overrides exist only in this process; local MQTT configuration is preserved.
process.env.EXPO_PUBLIC_ENABLE_SENSOR_SIMULATION = 'true';
process.env.EXPO_PUBLIC_SENSOR_MODE = 'simulation';

const path = require('node:path');
const projectRoot = path.dirname(require.resolve('../package.json'));
process.chdir(projectRoot);

const expoCli = require.resolve('expo/bin/cli');
const args = process.argv.slice(2);
process.argv = [process.execPath, expoCli, 'start', '--clear', ...args];

console.log('Ambiente de teste: sensores simulados, atualizados a cada 2 segundos.');
require(expoCli);
