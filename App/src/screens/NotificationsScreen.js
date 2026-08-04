import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ModalHeader from '../components/ModalHeader';
import { useNotifications } from '../contexts/NotificationsContext';
import { COLORS } from '../theme';

const ICONS = {
  route_new: { name: 'add-circle', color: COLORS.teal },
  route_assigned: { name: 'navigate-circle', color: COLORS.teal },
  reminder: { name: 'time', color: '#FF9500' },
  info: { name: 'information-circle', color: COLORS.navy },
  system: { name: 'settings', color: COLORS.textDim },
};

export default function NotificationsScreen({ navigation }) {
  const { items, markAllRead, markRead } = useNotifications();

  useEffect(() => {
    const t = setTimeout(() => markAllRead(), 1500);
    return () => clearTimeout(t);
  }, [markAllRead]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ModalHeader
        title="Notifications"
        subtitle={`${items.length} total`}
        onBack={() => navigation.goBack()}
        rightLabel="Mark all read"
        onRightPress={markAllRead}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {items.map((n) => {
          const icon = ICONS[n.type] || ICONS.info;
          return (
            <TouchableOpacity
              key={n.id}
              style={[styles.row, n.unread && styles.rowUnread]}
              onPress={() => markRead(n.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.iconWrap, { backgroundColor: icon.color + '1A' }]}>
                <Ionicons name={icon.name} size={20} color={icon.color} />
              </View>
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text style={styles.notifTitle}>{n.title}</Text>
                  {n.unread && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.notifBody}>{n.body}</Text>
                <Text style={styles.notifTime}>{n.time}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  markRead: { color: COLORS.teal, fontSize: 13, fontWeight: '600' },
  scroll: { padding: 16 },
  row: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  rowUnread: { backgroundColor: 'rgba(0,128,128,0.04)', borderColor: 'rgba(0,128,128,0.18)' },
  iconWrap: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  notifTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.teal },
  notifBody: { fontSize: 12, color: COLORS.textDim, lineHeight: 16 },
  notifTime: { fontSize: 11, color: COLORS.textDim, marginTop: 6 },
});
