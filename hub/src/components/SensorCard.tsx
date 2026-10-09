import { colors } from '../theme/colors';
import React from 'react';

import {
  View,
  Text,
  StyleSheet,
} from 'react-native';

interface SensorCardProps {
  icon: string;

  title: string;

  value: string | number;

  unit?: string;

  color: string;
}

export default function SensorCard({
  icon,
  title,
  value,
  unit,
  color,
}: SensorCardProps) {
  return (
    <View style={styles.card}>
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: `${color}20`,
          },
        ]}
      >
        <Text style={styles.icon}>
          {icon}
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>
          {title}
        </Text>

        <View style={styles.valueContainer}>
          <Text
            style={[
              styles.value,
              {
                color,
              },
            ]}
          >
            {value}
          </Text>

          {unit && (
            <Text style={styles.unit}>
              {unit}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,

    borderRadius: 20,

    padding: 20,

    marginBottom: 15,

    flexDirection: 'row',

    alignItems: 'center',

    shadowColor: colors.shadow,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    shadowOpacity: 0.08,

    shadowRadius: 10,

    elevation: 4,
  },

  iconContainer: {
    width: 60,

    height: 60,

    borderRadius: 18,

    justifyContent: 'center',

    alignItems: 'center',

    marginRight: 18,
  },

  icon: {
    fontSize: 30,
  },

  content: {
    flex: 1,
  },

  title: {
    fontSize: 15,

    color: colors.text,

    marginBottom: 5,

    fontWeight: '500',
  },

  valueContainer: {
    flexDirection: 'row',

    alignItems: 'baseline',
  },

  value: {
    fontSize: 32,

    fontWeight: '700',
  },

  unit: {
    fontSize: 16,

    color: colors.text,

    marginLeft: 5,
  },
});
