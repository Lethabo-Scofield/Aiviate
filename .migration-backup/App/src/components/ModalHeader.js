import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LogoMark from './LogoMark';
import { COLORS } from '../theme';

export default function ModalHeader({ title, subtitle, onBack, rightLabel, onRightPress, showLogo = true }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: (Platform.OS === 'web' ? 14 : insets.top) + 8 },
      ]}
    >
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={22} color={COLORS.text} />
      </TouchableOpacity>

      <View style={{ flex: 1, paddingHorizontal: 8 }}>
        <View style={styles.titleRow}>
          {showLogo ? <LogoMark size={isCompact ? 20 : 22} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.title, { fontSize: isCompact ? 18 : 20 }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>

      {rightLabel ? (
        <TouchableOpacity
          onPress={onRightPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.rightLabel}>{rightLabel}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 38 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { color: COLORS.text, fontWeight: '800', letterSpacing: -0.3, flexShrink: 1 },
  subtitle: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  rightLabel: { color: COLORS.teal, fontSize: 13, fontWeight: '700', paddingHorizontal: 8 },
});
