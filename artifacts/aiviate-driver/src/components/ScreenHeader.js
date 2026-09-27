import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../contexts/NotificationsContext';
import { useDriver } from '../contexts/DriverContext';
import Avatar from './Avatar';
import LogoMark from './LogoMark';
import NotificationsPopover from './NotificationsPopover';
import { haptic } from '../utils/haptics';
import { COLORS } from '../theme';

export default function ScreenHeader({ title, subtitle }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { unreadCount } = useNotifications();
  const { driver } = useDriver();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const isCompact = width < 360;
  const titleSize = isCompact ? 20 : width < 420 ? 22 : 24;
  const horizontalPad = isCompact ? 14 : 18;
  const btnSize = isCompact ? 38 : 42;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: (Platform.OS === 'web' ? 14 : insets.top) + 10,
          paddingHorizontal: horizontalPad,
        },
      ]}
    >
      <View style={styles.left}>
        <View style={styles.titleRow}>
          <LogoMark size={isCompact ? 22 : 26} style={{ marginRight: 8 }} />
          <Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={[styles.right, { gap: isCompact ? 8 : 10 }]}>
        <TouchableOpacity
          style={[styles.iconBtn, { width: btnSize, height: btnSize }]}
          onPress={() => { haptic.selection(); setPopoverOpen(true); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="notifications-outline" size={isCompact ? 20 : 22} color={COLORS.text} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <NotificationsPopover
          visible={popoverOpen}
          onClose={() => setPopoverOpen(false)}
          onSeeAll={() => navigation.navigate('Notifications')}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open driver profile"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={styles.avatarWrap}
        >
          <Avatar
            uri={driver?.avatar_url}
            initials={driver?.initials || '?'}
            size={btnSize}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bg,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  left: { flex: 1, paddingRight: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { color: COLORS.text, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: COLORS.textDim, fontSize: 12, marginTop: 3, fontWeight: '500', marginLeft: 34 },
  right: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: {
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.teal,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: COLORS.bg,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  avatarWrap: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
});
