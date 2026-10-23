import type { SensorData } from '../types/SensorData';

const SIMULATION_INTERVAL_MS = 2000;

export function createSimulatedSensorData(step: number): SensorData {
  const round = (value: number) => Math.round(value * 10) / 10;

  return {
    distancia: round(50 + 30 * Math.sin(step / 2)),
    temperatura: round(25 + 3 * Math.sin(step / 4)),
    umidade: round(60 + 15 * Math.cos(step / 3)),
    movimento: Math.floor(step / 3) % 2 === 1,
  };
}

// Simulation runs locally and never publishes messages to the MQTT broker.
export function startSensorSimulation(onMessage: (data: SensorData) => void): () => void {
  let step = 0;
  const timer = setInterval(() => {
    step += 1;
    onMessage(createSimulatedSensorData(step));
  }, SIMULATION_INTERVAL_MS);

  return () => clearInterval(timer);
}
