// Animated shimmer placeholder. A single Skeleton block + composed
// SkeletonCard preset for list-style loading states (Apple Mail / News).
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing, Platform } from 'react-native';
import { COLORS } from '../theme';

const USE_NATIVE = Platform.OS !== 'web';

export function Skeleton({ width = '100%', height = 14, radius = 6, style }) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE }),
        Animated.timing(opacity, { toValue: 0.45, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: 'rgba(15,42,61,0.08)', opacity },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Skeleton width={70} height={14} />
          <Skeleton width={110} height={10} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={70} height={20} radius={10} />
      </View>
      <View style={styles.gap} />
      <Skeleton height={12} width="92%" />
      <Skeleton height={12} width="78%" style={{ marginTop: 8 }} />
      <Skeleton height={12} width="60%" style={{ marginTop: 8 }} />
      <View style={styles.gap} />
      <Skeleton height={44} radius={12} />
    </View>
  );
}

export function SkeletonRow() {
  return (
    <View style={styles.rowItem}>
      <Skeleton width={32} height={32} radius={10} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Skeleton width="40%" height={12} />
        <Skeleton width="65%" height={10} style={{ marginTop: 6 }} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Skeleton width={60} height={12} />
        <Skeleton width={80} height={10} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  gap: { height: 14 },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
