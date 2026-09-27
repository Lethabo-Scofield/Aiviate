// Card-style Pressable with iOS-feeling spring scale-down on press.
// Optional haptic on press in.
import React, { useRef } from 'react';
import { Animated, Pressable, Platform } from 'react-native';
import { haptic } from '../utils/haptics';

const USE_NATIVE = Platform.OS !== 'web';

export default function PressableCard({
  onPress,
  style,
  children,
  scaleTo = 0.97,
  hapticType = 'light',
  disabled,
  accessibilityLabel,
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value) =>
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: USE_NATIVE,
      friction: 7,
      tension: 180,
    }).start();

  return (
    <Pressable
      onPressIn={() => {
        if (disabled) return;
        animateTo(scaleTo);
        if (hapticType && haptic[hapticType]) haptic[hapticType]();
      }}
      onPressOut={() => animateTo(1)}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { disabled: true } : undefined}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}
