import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTour } from '../contexts/TourContext';
import { haptic } from '../utils/haptics';
import { COLORS } from '../theme';

const USE_NATIVE = Platform.OS !== 'web';

// Dims the screen above the tab bar and shows the current step's card. The
// tab bar itself stays visible and highlights the tab being described.
export default function TourOverlay() {
  const { step, index, total, next, back, finish } = useTour();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!step) return;
    navigation.navigate('Tabs', { screen: step.tab });
  }, [step, navigation]);

  useEffect(() => {
    Animated.timing(fade, { toValue: step ? 1 : 0, duration: 220, useNativeDriver: USE_NATIVE }).start();
  }, [step, fade]);

  if (!step) return null;

  const tabBarHeight = 56 + (Platform.OS === 'web' ? 6 : Math.max(insets.bottom, 6));
  const last = index === total - 1;

  return (
    <Animated.View
      style={[styles.backdrop, { bottom: tabBarHeight, opacity: fade }]}
      accessibilityViewIsModal
    >
      <View style={styles.card} accessibilityRole="alert" testID="tour-card">
        <View style={styles.headRow}>
          <View style={styles.iconWrap}>
            <Ionicons name={step.icon} size={20} color={COLORS.teal} />
          </View>
          <Text style={styles.stepText}>Step {index + 1} of {total}</Text>
          <TouchableOpacity onPress={finish} accessibilityRole="button" accessibilityLabel="Skip tour" hitSlop={10}>
            <Ionicons name="close" size={20} color={COLORS.textDim} />
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>

        <View style={styles.dots}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={finish} accessibilityRole="button">
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {index > 0 && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => { haptic.selection(); back(); }} accessibilityRole="button">
                <Text style={styles.secondaryText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => { haptic.selection(); next(); }}
              accessibilityRole="button"
              testID="tour-next"
            >
              <Text style={styles.primaryText}>{last ? 'Finish' : 'Next'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(10,12,14,0.55)',
    justifyContent: 'flex-end',
    padding: 14,
    zIndex: 50,
  },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 20, padding: 18,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 12 },
      web: { boxShadow: '0 18px 48px rgba(0,0,0,0.25)' },
    }),
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.fill, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 19, fontWeight: '800', color: COLORS.text, marginTop: 12 },
  body: { fontSize: 14, lineHeight: 20, color: COLORS.textDim, marginTop: 6 },
  dots: { flexDirection: 'row', gap: 5, marginTop: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.fill },
  dotActive: { width: 18, backgroundColor: COLORS.teal },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  skip: { color: COLORS.textDim, fontWeight: '600', fontSize: 14, padding: 4 },
  secondaryBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.fill },
  secondaryText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  primaryBtn: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.teal },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
