import { colors } from '../theme/colors';
import { StyleSheet, Text, View } from 'react-native';

import type { MQTTStatus } from '../services/mqtts';

const labels: Record<MQTTStatus, string> = {
  connecting: 'MQTT conectando',
  connected: 'MQTT conectado',
  reconnecting: 'MQTT reconectando',
  disconnected: 'MQTT desconectado',
  error: 'Erro na conexão MQTT',
};

export default function StatusBadge({ status }: { status: MQTTStatus }) {
  const connected = status === 'connected';
  const waiting = status === 'connecting' || status === 'reconnecting';
  const color = connected ? colors.primaryDark : waiting ? colors.warning : colors.danger;
  const backgroundColor = connected ? colors.primarySoft : waiting ? colors.warningSoft : colors.dangerSoft;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text accessibilityLiveRegion="polite" style={[styles.text, { color }]}>
        {labels[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  text: { fontSize: 13, fontWeight: '600' },
});
