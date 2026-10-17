import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as backend from '../services/backend';
import { ApiError } from '../services/http';
import { COLORS } from '../theme';

export const RISK = {
  low: { label: 'Good to go', color: COLORS.success, icon: 'shield-checkmark' },
  medium: { label: 'Drive with care', color: COLORS.warning, icon: 'warning' },
  high: { label: 'Rest before driving', color: COLORS.danger, icon: 'alert-circle' },
};

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return d.toDateString() === new Date().toDateString();
}

// Daily pre-drive fatigue check-in prompt shown at the top of Routes.
export default function CheckinCard() {
  const navigation = useNavigation();
  const [state, setState] = useState({ loading: true, checkin: null, advice: '', unavailable: false });

  useFocusEffect(useCallback(() => {
    let alive = true;
    backend.getLatestCheckin()
      .then((res) => alive && setState({ loading: false, checkin: res?.checkin || null, advice: res?.advice || '', unavailable: false }))
      .catch((e) => alive && setState({
        loading: false, checkin: null, advice: '',
        unavailable: e instanceof ApiError && (e.status === 404 || e.status === 501),
      }));
    return () => { alive = false; };
  }, []));

  if (state.loading || state.unavailable) return null;

  const open = () => navigation.navigate('Checkin');
  const done = state.checkin && isToday(state.checkin.created_at);

  if (done) {
    const risk = RISK[state.checkin.risk_level] || RISK.low;
    return (
      <TouchableOpacity style={styles.card} onPress={open} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Checked in today: ${risk.label}. Check in again`}>
        <View style={styles.row}>
          <Ionicons name={risk.icon} size={20} color={risk.color} />
          <Text style={styles.title}>Checked in · {risk.label}</Text>
          <Text style={styles.link}>Again</Text>
        </View>
        {state.checkin.risk_level !== 'low' && state.advice ? (
          <Text style={styles.body} numberOfLines={3}>{state.advice}</Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.card, styles.prompt]}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="bed-outline" size={20} color={COLORS.teal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Before you drive: quick check-in</Text>
          <Text style={styles.body}>Four questions about sleep and anything that could make you tired today.</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.btn} onPress={open} activeOpacity={0.85} accessibilityRole="button" testID="start-checkin">
        <Text style={styles.btnText}>Start check-in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: COLORS.border },
  prompt: { borderColor: 'rgba(0,128,128,0.35)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,128,128,0.10)', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  body: { fontSize: 13, lineHeight: 18, color: COLORS.textDim, marginTop: 4 },
  link: { color: COLORS.teal, fontWeight: '700', fontSize: 13 },
  btn: { marginTop: 14, backgroundColor: COLORS.teal, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
