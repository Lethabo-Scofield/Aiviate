import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';
import { haptic } from '../utils/haptics';

const USE_NATIVE = Platform.OS !== 'web';

const ICONS = {
  Jobs: ['map', 'map-outline'],
  Active: ['navigate', 'navigate-outline'],
  Earnings: ['time', 'time-outline'],
};
const LABELS = { Jobs: 'Routes', Active: 'Active', Earnings: 'History' };

function TabButton({ route, isFocused, onPress, iconSize, labelSize }) {
  const [active, inactive] = ICONS[route.name] || ['ellipse', 'ellipse-outline'];
  const label = LABELS[route.name] || route.name;

  const pressScale = useRef(new Animated.Value(1)).current;
  const focusScale = useRef(new Animated.Value(isFocused ? 1 : 0.92)).current;

  useEffect(() => {
    Animated.spring(focusScale, {
      toValue: isFocused ? 1 : 0.92,
      useNativeDriver: USE_NATIVE,
      friction: 7,
      tension: 140,
    }).start();
  }, [isFocused, focusScale]);

  const animateTo = (v) =>
    Animated.spring(pressScale, { toValue: v, useNativeDriver: USE_NATIVE, friction: 7, tension: 200 }).start();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={label}
      onPressIn={() => animateTo(0.92)}
      onPressOut={() => animateTo(1)}
      onPress={onPress}
      style={styles.tab}
      hitSlop={6}
    >
      <Animated.View style={{ transform: [{ scale: pressScale }] }}>
        <Animated.View
          style={[styles.iconWrap, isFocused && styles.iconWrapActive, { transform: [{ scale: focusScale }] }]}
        >
          <Ionicons
            name={isFocused ? active : inactive}
            size={iconSize}
            color={isFocused ? COLORS.tint : COLORS.textTertiary}
          />
        </Animated.View>
        <Text
          style={[
            styles.label,
            { fontSize: labelSize, color: isFocused ? COLORS.tint : COLORS.textDim },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function AppTabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const labelSize = isCompact ? 10 : 11;
  const iconSize = isCompact ? 20 : 22;

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: (Platform.OS === 'web' ? 6 : Math.max(insets.bottom, 6)),
          height: 56 + (Platform.OS === 'web' ? 6 : Math.max(insets.bottom, 6)),
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            haptic.selection();
            navigation.navigate(route.name);
          }
        };
        return (
          <TabButton
            key={route.key}
            route={route}
            isFocused={isFocused}
            onPress={onPress}
            iconSize={iconSize}
            labelSize={labelSize}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    paddingHorizontal: 4,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: -2 } },
      android: { elevation: 8 },
      web: { boxShadow: '0 -2px 8px rgba(0,0,0,0.06)' },
    }),
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, minHeight: 48 },
  iconWrap: { width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 2, alignSelf: 'center' },
  // iOS tab bars don't put a fill behind the active icon — selection is
  // communicated by tint color alone.
  iconWrapActive: {},
  label: { fontWeight: '600', marginTop: 1, textAlign: 'center' },
});
