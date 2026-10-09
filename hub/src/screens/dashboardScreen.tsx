import { colors } from '../theme/colors';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SensorCard from '../components/SensorCard';
import StatusBadge from '../components/StatusBadge';
import { connectMQTT, type MQTTStatus } from '../services/mqtts';
import { createSimulatedSensorData, startSensorSimulation } from '../services/sensorSimulation';
import type { SensorData } from '../types/SensorData';

type DataMode = 'real' | 'simulation';

const simulationEnabled = __DEV__ || process.env.EXPO_PUBLIC_ENABLE_SENSOR_SIMULATION === 'true';
const initialMode: DataMode = simulationEnabled && process.env.EXPO_PUBLIC_SENSOR_MODE === 'simulation'
  ? 'simulation'
  : 'real';

export default function DashboardScreen() {
  const [mode, setMode] = useState<DataMode>(initialMode);
  const [simulation, setSimulation] = useState<{ data: SensorData; receivedAt: Date | null } | null>(() =>
    initialMode === 'simulation'
      // Keep the initial web render deterministic; timestamp starts on the first update.
      ? { data: createSimulatedSensorData(0), receivedAt: null }
      : null);
  const [status, setStatus] = useState<MQTTStatus>('connecting');
  const [realSensors, setRealSensors] = useState<SensorData | null>(null);
  const [lastRealReceived, setLastRealReceived] = useState<Date | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'simulation') {
      return startSensorSimulation((data) => {
        setSimulation({ data, receivedAt: new Date() });
      });
    }

    return connectMQTT({
      onStatus: (nextStatus) => {
        setStatus(nextStatus);
        if (nextStatus === 'connected') setConnectionError(null);
      },
      onMessage: (data) => {
        setRealSensors(data);
        setLastRealReceived(new Date());
        setMessageError(null);
      },
      onError: (error) => setConnectionError(error.message),
      onInvalidMessage: (error) => setMessageError(error.message),
    });
  }, [mode]);

  const isSimulation = mode === 'simulation';
  const sensors = isSimulation ? simulation?.data ?? null : realSensors;
  const lastReceived = isSimulation ? simulation?.receivedAt ?? null : lastRealReceived;

  function toggleDataMode() {
    const nextMode: DataMode = isSimulation ? 'real' : 'simulation';
    setRealSensors(null);
    setLastRealReceived(null);
    setConnectionError(null);
    setMessageError(null);
    setStatus('connecting');
    setSimulation(nextMode === 'simulation'
      ? { data: createSimulatedSensorData(0), receivedAt: new Date() }
      : null);
    setMode(nextMode);
  }

  const motionColor = !sensors ? colors.text : sensors.movimento ? colors.danger : colors.primaryDark;
  const motionBackground = !sensors ? colors.neutralSoft : sensors.movimento ? colors.dangerSoft : colors.primarySoft;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Monitoramento</Text>
            <Text style={styles.subtitle}>Sensores ESP32</Text>
          </View>
          <Text style={styles.espIcon}>📡</Text>
        </View>

        {simulationEnabled && (
          <View style={styles.sourceControl}>
            <Text style={styles.sourceLabel}>Fonte dos dados</Text>
            <Text style={styles.sourceValue}>
              {isSimulation ? 'Simulação para teste e homologação' : 'Dados reais via MQTT'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Alterna entre leituras simuladas e leituras do ESP32 via MQTT."
              onPress={toggleDataMode}
              style={({ pressed }) => [styles.modeButton, pressed && styles.modeButtonPressed]}
            >
              <Text style={styles.modeButtonText}>
                {isSimulation ? 'Usar dados reais' : 'Usar simulação'}
              </Text>
            </Pressable>
          </View>
        )}

        {isSimulation ? (
          <View style={styles.simulationBadge}>
            <Text accessibilityLiveRegion="polite" style={styles.simulationBadgeText}>Simulação ativa</Text>
          </View>
        ) : (
          <StatusBadge status={status} />
        )}
        {isSimulation && (
          <Text style={styles.notice}>Dados fictícios atualizados a cada 2 segundos.</Text>
        )}
        {!isSimulation && connectionError && <Text style={styles.error}>{connectionError}</Text>}
        {!isSimulation && messageError && <Text style={styles.error}>{messageError}</Text>}
        {!isSimulation && !sensors && (
          <Text style={styles.notice}>
            {status === 'connected'
              ? 'Conectado ao broker. Aguardando leituras do ESP32.'
              : 'Aguardando conexão e leituras dos sensores.'}
          </Text>
        )}
        {!isSimulation && sensors && status !== 'connected' && (
          <Text style={styles.notice}>Conexão indisponível. Exibindo as últimas leituras recebidas.</Text>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sensores</Text>
          <SensorCard icon="📏" title="Distância" value={sensors?.distancia.toFixed(1) ?? '—'} unit="cm" color={colors.primaryDark} />
          <SensorCard icon="🌡️" title="Temperatura" value={sensors?.temperatura.toFixed(1) ?? '—'} unit="°C" color={colors.primaryDark} />
          <SensorCard icon="💧" title="Umidade" value={sensors?.umidade.toFixed(1) ?? '—'} unit="%" color={colors.primaryDark} />

          <View style={styles.motionCard}>
            <View style={styles.motionContent}>
              <Text style={styles.motionTitle}>Movimento</Text>
              <Text style={[styles.motionStatus, { color: motionColor }]}>
                {!sensors ? 'Aguardando leitura' : sensors.movimento ? 'Movimento detectado' : 'Nenhum movimento'}
              </Text>
            </View>
            <View style={[styles.motionIcon, { backgroundColor: motionBackground }]}>
              <Text style={styles.motionEmoji}>{!sensors ? '⌛' : sensors.movimento ? '🚨' : '🛡️'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {isSimulation ? 'Dados simulados neste aplicativo' : 'Dados recebidos via MQTT'}
          </Text>
          {lastReceived && (
            <Text style={styles.footerText}>
              {isSimulation ? 'Última simulação às ' : 'Última mensagem recebida às '}
              {lastReceived.toLocaleTimeString('pt-BR')}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  title: { fontSize: 30, fontWeight: '800', color: colors.title },
  subtitle: { fontSize: 15, color: colors.text, marginTop: 3 },
  espIcon: { fontSize: 36 },
  sourceControl: {
    backgroundColor: colors.surface, padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16, gap: 8,
  },
  sourceLabel: { fontSize: 13, color: colors.text },
  sourceValue: { fontSize: 16, fontWeight: '700', color: colors.title },
  modeButton: {
    backgroundColor: colors.primaryDark, borderRadius: 10, padding: 12,
    minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  modeButtonPressed: { backgroundColor: colors.primaryDark, opacity: 0.85 },
  modeButtonText: { color: colors.surface, fontSize: 15, fontWeight: '600' },
  simulationBadge: {
    backgroundColor: colors.primarySoft, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, alignSelf: 'flex-start',
  },
  simulationBadgeText: { color: colors.primaryDark, fontSize: 13, fontWeight: '600' },
  notice: { color: colors.text, marginTop: 12 },
  error: { color: colors.danger, marginTop: 12 },
  section: { marginTop: 30 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.title, marginBottom: 15 },
  motionCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
  },
  motionContent: { flex: 1, marginRight: 12 },
  motionTitle: { fontSize: 15, color: colors.text, marginBottom: 5 },
  motionStatus: { fontSize: 18, fontWeight: '700' },
  motionIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  motionEmoji: { fontSize: 30 },
  footer: { alignItems: 'center', marginTop: 30 },
  footerText: { color: colors.text, fontSize: 13 },
});
