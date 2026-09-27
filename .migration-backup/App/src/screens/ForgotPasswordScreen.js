import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import LogoMark from '../components/LogoMark';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../utils/haptics';
import { COLORS } from '../theme';

export default function ForgotPasswordScreen({ navigation }) {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [notImpl, setNotImpl] = useState(false);

  const onSubmit = async () => {
    if (email.trim().length < 4 || busy) return;
    setBusy(true);
    haptic.medium();
    const res = await forgotPassword(email);
    setBusy(false);
    if (res.notImplemented) { setNotImpl(true); return; }
    // Same confirmation regardless of whether the account exists.
    setSent(true);
    haptic.success();
  };

  if (sent) {
    return (
      <View style={styles.center}>
        <Ionicons name="mail-outline" size={48} color={COLORS.teal} />
        <Text style={styles.doneTitle}>Check your email</Text>
        <Text style={styles.doneSub}>
          If an account exists for {email.trim()}, we've sent a secure link to reset your password.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Login')} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <LogoMark size={56} />
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>We'll email you a secure reset link.</Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
            placeholderTextColor={COLORS.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
          {notImpl && (
            <Text style={styles.error}>
              Password reset isn't available in this environment yet. Contact your dispatcher.
            </Text>
          )}
          <TouchableOpacity
            style={[styles.primaryBtn, (email.trim().length < 4 || busy) && styles.primaryBtnDisabled]}
            onPress={onSubmit}
            disabled={email.trim().length < 4 || busy}
            activeOpacity={0.85}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send reset link</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: COLORS.bg },
  brand: { alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 14 },
  subtitle: { fontSize: 13, color: COLORS.textDim, marginTop: 6 },
  form: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16, color: COLORS.text, backgroundColor: COLORS.surfaceAlt,
  },
  error: { color: COLORS.danger, fontSize: 13, marginTop: 12 },
  primaryBtn: { marginTop: 24, backgroundColor: COLORS.teal, borderRadius: 14, paddingVertical: 16, alignItems: 'center', paddingHorizontal: 24 },
  primaryBtnDisabled: { backgroundColor: '#9AA8B2' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkBtn: { alignSelf: 'center', marginTop: 16, padding: 8 },
  linkText: { color: COLORS.teal, fontWeight: '600', fontSize: 14 },
  doneTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginTop: 16 },
  doneSub: { fontSize: 14, color: COLORS.textDim, textAlign: 'center', marginTop: 10, lineHeight: 20 },
});
