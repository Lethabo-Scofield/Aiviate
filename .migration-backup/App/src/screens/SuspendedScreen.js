import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../theme';

// Shown when the server reports the driver's account is suspended/blocked.
// The active session has effectively been revoked server-side; the only action
// available is to sign out.
export default function SuspendedScreen() {
  const { signOut, user } = useAuth();
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="lock-closed" size={40} color={COLORS.danger} />
      </View>
      <Text style={styles.title}>Account suspended</Text>
      <Text style={styles.body}>
        {user?.name ? `${user.name}, your` : 'Your'} account has been suspended by your dispatcher.
        You can't access routes until it's reactivated.
      </Text>
      <Text style={styles.contact}>Contact your operations team for help.</Text>
      <TouchableOpacity style={styles.btn} onPress={signOut} activeOpacity={0.85}>
        <Text style={styles.btnText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,59,48,0.10)', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  body: { fontSize: 15, color: COLORS.textDim, textAlign: 'center', lineHeight: 22 },
  contact: { fontSize: 13, color: COLORS.textTertiary, textAlign: 'center', marginTop: 16 },
  btn: { marginTop: 28, backgroundColor: COLORS.navy, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
