// Thin haptics wrapper. expo-haptics no-ops on web automatically, but we
// also guard imports so a missing module never crashes the bundle.
import { Platform } from 'react-native';

let H = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line global-require
    H = require('expo-haptics');
  } catch (_) {
    H = null;
  }
}

export const haptic = {
  light: () => H?.impactAsync?.(H.ImpactFeedbackStyle.Light),
  medium: () => H?.impactAsync?.(H.ImpactFeedbackStyle.Medium),
  heavy: () => H?.impactAsync?.(H.ImpactFeedbackStyle.Heavy),
  selection: () => H?.selectionAsync?.(),
  success: () => H?.notificationAsync?.(H.NotificationFeedbackType.Success),
  warning: () => H?.notificationAsync?.(H.NotificationFeedbackType.Warning),
  error: () => H?.notificationAsync?.(H.NotificationFeedbackType.Error),
};
