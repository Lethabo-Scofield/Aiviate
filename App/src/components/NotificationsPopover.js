import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Animated,
  Easing,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../contexts/NotificationsContext';
import { COLORS } from '../theme';

const ICONS = {
  route_new: { name: 'add-circle', color: COLORS.teal },
  route_assigned: { name: 'navigate-circle', color: COLORS.teal },
  reminder: { name: 'time', color: '#FF9500' },
  info: { name: 'information-circle', color: COLORS.navy },
  system: { name: 'settings', color: COLORS.textDim },
};

const MAX_VISIBLE = 6;

export default function NotificationsPopover({ visible, onClose, onSeeAll }) {
  const { items, unreadCount, markAllRead, markRead } = useNotifications();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [visible, anim]);

  // Auto-mark unread items as read shortly after the popover opens, mirroring
  // the prior full-screen behavior so badges clear once the user has seen them.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => markAllRead(), 1500);
    return () => clearTimeout(t);
  }, [visible, markAllRead]);

  const top = (Platform.OS === 'web' ? 14 : insets.top) + 60;
  const sheetWidth = Math.min(width - 24, 360);

  const visibleItems = items.slice(0, MAX_VISIBLE);
  const hasMore = items.length > MAX_VISIBLE;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: anim }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.anchor,
          {
            top,
            right: 12,
            width: sheetWidth,
            opacity: anim,
            transform: [
              {
                translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
              },
              {
                scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }),
              },
            ],
          },
        ]}
      >
        <View style={styles.caret} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Notifications</Text>
              <Text style={styles.subtitle}>
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </Text>
            </View>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={markAllRead} hitSlop={6}>
                <Text style={styles.markAll}>Mark all read</Text>
              </TouchableOpacity>
            )}
          </View>

          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={28} color={COLORS.textDim} />
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={styles.list}>
              {visibleItems.map((n) => {
                const icon = ICONS[n.type] || ICONS.info;
                return (
                  <TouchableOpacity
                    key={n.id}
                    style={[styles.row, n.unread && styles.rowUnread]}
                    onPress={() => markRead(n.id)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: icon.color + '1A' }]}>
                      <Ionicons name={icon.name} size={18} color={icon.color} />
                    </View>
                    <View style={styles.body}>
                      <View style={styles.titleRow}>
                        <Text style={styles.notifTitle} numberOfLines={1}>{n.title}</Text>
                        {n.unread && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
                      <Text style={styles.notifTime}>{n.time}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {(hasMore || items.length > 0) && (
            <TouchableOpacity
              style={styles.footer}
              onPress={() => { onClose(); onSeeAll && onSeeAll(); }}
              activeOpacity={0.8}
            >
              <Text style={styles.footerText}>See all notifications</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.teal} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,42,61,0.18)',
  },
  anchor: {
    position: 'absolute',
  },
  caret: {
    position: 'absolute',
    top: -6,
    right: 18,
    width: 12,
    height: 12,
    backgroundColor: COLORS.surface,
    transform: [{ rotate: '45deg' }],
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: COLORS.border,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  title: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },
  markAll: { color: COLORS.teal, fontSize: 12, fontWeight: '700' },

  list: { paddingHorizontal: 10, paddingBottom: 8, gap: 4 },
  row: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 12,
    gap: 10,
    backgroundColor: 'transparent',
  },
  rowUnread: { backgroundColor: COLORS.fillSecondary },
  iconWrap: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  notifTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, flex: 1 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.teal },
  notifBody: { fontSize: 12, color: COLORS.textDim, lineHeight: 16 },
  notifTime: { fontSize: 10, color: COLORS.textDim, marginTop: 4 },

  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { color: COLORS.textDim, fontSize: 13 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  footerText: { color: COLORS.teal, fontSize: 13, fontWeight: '700' },
});
