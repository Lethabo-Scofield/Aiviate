import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';

import LogoMark from '../components/LogoMark';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { haptic } from '../utils/haptics';
import { COLORS } from '../theme';

// Reached via the onboarding deep link (aviate://activate?token=...&email=...)
// or manually with a pasted token. The driver sets their password here; on
// success the account becomes active and they are signed straight in.
export default function ActivateScreen({ navigation, route }) {
  const { activate } = useAuth();
  const { toast } = useToast();
  const params = route?.params || {};
  const [token, setToken] = useState(params.token || '');
  const [email] = useState(params.email || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (params.token) setToken(params.token);
  }, [params.token]);

  const strongEnough = password.length >= 8;
  const matches = password === confirm;
  const canSubmit = token.trim().length > 0 && strongEnough && matches && !busy;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    haptic.medium();
    const res = await activate({ token: token.trim(), password });
    setBusy(false);
    if (res.ok) {
      haptic.success();
      toast.success('Account activated — welcome aboard');
    } else if (res.notImplemented) {
      setError('Activation is not available in this environment yet. Contact your dispatcher.');
    } else {
      haptic.error();
      setError(res.error || 'This activation link is invalid or has expired.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <LogoMark size={56} />
          <Text style={styles.title}>Activate your account</Text>
          {email ? <Text style={styles.subtitle}>{email}</Text> : null}
          <Text style={styles.help}>Choose a password to finish setting up.</Text>
        </View>

        <View style={styles.form}>
          {!params.token && (
            <>
              <Text style={styles.label}>Activation code</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                placeholder="Paste from your email"
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          <Text style={[styles.label, params.token ? null : { marginTop: 16 }]}>New password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor={COLORS.textTertiary}
            secureTextEntry
            textContentType="newPassword"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>Confirm password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter password"
            placeholderTextColor={COLORS.textTertiary}
            secureTextEntry
            textContentType="newPassword"
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />

          {password.length > 0 && !strongEnough && (
            <Text style={styles.hint}>Use at least 8 characters.</Text>
          )}
          {confirm.length > 0 && !matches && (
            <Text style={styles.hint}>Passwords don't match.</Text>
          )}
          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
            onPress={onSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Activate & sign in</Text>}
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
  brand: { alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 14 },
  subtitle: { fontSize: 14, color: COLORS.teal, marginTop: 6, fontWeight: '600' },
  help: { fontSize: 13, color: COLORS.textDim, marginTop: 6, textAlign: 'center' },
  form: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16, color: COLORS.text, backgroundColor: COLORS.surfaceAlt,
  },
  hint: { color: COLORS.warning, fontSize: 12, marginTop: 8 },
  error: { color: COLORS.danger, fontSize: 13, marginTop: 12 },
  primaryBtn: { marginTop: 24, backgroundColor: COLORS.teal, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryBtnDisabled: { backgroundColor: '#9AA8B2' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkBtn: { alignSelf: 'center', marginTop: 16, padding: 8 },
  linkText: { color: COLORS.teal, fontWeight: '600', fontSize: 14 },
});
