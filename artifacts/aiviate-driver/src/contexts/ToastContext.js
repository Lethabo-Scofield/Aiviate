// Lightweight global toast: slides down from top, auto-dismisses.
// Use via const { toast } = useToast(); toast.success('Pickup confirmed').
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Easing, Platform } from 'react-native';

const USE_NATIVE = Platform.OS !== 'web';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';

const ToastCtx = createContext(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// Use iOS-style dark/neutral toast surfaces — color is reserved for the
// leading icon so the brand tint isn't washed across the entire chip.
const VARIANTS = {
  success: { icon: 'checkmark-circle', tint: COLORS.success, bg: 'rgba(28,28,30,0.96)' },
  info:    { icon: 'information-circle', tint: COLORS.tint, bg: 'rgba(28,28,30,0.96)' },
  error:   { icon: 'alert-circle', tint: COLORS.danger, bg: 'rgba(28,28,30,0.96)' },
};

export function ToastProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef(null);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -80, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: USE_NATIVE }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: USE_NATIVE }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const show = useCallback((message, { variant = 'success', duration = 2200 } = {}) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setToast({ message, variant });
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: USE_NATIVE, friction: 9, tension: 90 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE }),
      ]).start();
    });
    hideTimer.current = setTimeout(dismiss, duration);
  }, [dismiss, opacity, translateY]);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const api = {
    show,
    success: (m, opts) => show(m, { ...opts, variant: 'success' }),
    info:    (m, opts) => show(m, { ...opts, variant: 'info' }),
    error:   (m, opts) => show(m, { ...opts, variant: 'error' }),
    dismiss,
  };

  const v = toast ? VARIANTS[toast.variant] : null;
  const topOffset = (insets.top || (Platform.OS === 'web' ? 12 : 0)) + 8;

  return (
    <ToastCtx.Provider value={{ toast: api }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            { top: topOffset, transform: [{ translateY }], opacity },
          ]}
        >
          <View style={[styles.card, { backgroundColor: v.bg }]}>
            <Ionicons name={v.icon} size={18} color={v.tint} />
            <Text style={styles.text} numberOfLines={2}>{toast.message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 9999 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    maxWidth: 480,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 10 },
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.18)' },
    }),
  },
  text: { color: '#fff', fontWeight: '600', fontSize: 13, flexShrink: 1 },
});
