export interface SensorData {
  distancia: number;
  temperatura: number;
  umidade: number;
  movimento: boolean;
}

export function isSensorData(value: unknown): value is SensorData {
  if (typeof value !== 'object' || value === null) return false;

  const data = value as Record<string, unknown>;
  return (
    typeof data.distancia === 'number' &&
    Number.isFinite(data.distancia) &&
    data.distancia >= 0 &&
    typeof data.temperatura === 'number' &&
    Number.isFinite(data.temperatura) &&
    typeof data.umidade === 'number' &&
    Number.isFinite(data.umidade) &&
    data.umidade >= 0 &&
    data.umidade <= 100 &&
    typeof data.movimento === 'boolean'
  );
}
