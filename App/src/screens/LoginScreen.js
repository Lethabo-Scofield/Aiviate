import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';

import LogoMark from '../components/LogoMark';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { haptic } from '../utils/haptics';
import { COLORS } from '../theme';

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().length > 3 && password.length > 0 && !busy;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    haptic.medium();
    const res = await signIn(email, password);
    setBusy(false);
    if (res.ok) {
      haptic.success();
    } else if (res.suspended) {
      haptic.error();
    } else {
      haptic.error();
      toast.error(res.error || 'Invalid email or password');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <LogoMark size={64} />
          <Text style={styles.title}>Aiviate Driver</Text>
          <Text style={styles.subtitle}>Sign in to see today's route.</Text>
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
            textContentType="emailAddress"
            returnKeyType="next"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={COLORS.textTertiary}
            secureTextEntry
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
            onPress={onSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign in</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={styles.linkText}>Forgot password?</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            New here? Open the activation link from your onboarding email to set up your account.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brand: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginTop: 16 },
  subtitle: { fontSize: 14, color: COLORS.textDim, marginTop: 6 },
  form: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16, color: COLORS.text, backgroundColor: COLORS.surfaceAlt,
  },
  primaryBtn: {
    marginTop: 24, backgroundColor: COLORS.teal, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnDisabled: { backgroundColor: '#9AA8B2' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkBtn: { alignSelf: 'center', marginTop: 16, padding: 8 },
  linkText: { color: COLORS.teal, fontWeight: '600', fontSize: 14 },
  footer: { marginTop: 28, paddingHorizontal: 12 },
  footerText: { fontSize: 12, color: COLORS.textDim, textAlign: 'center', lineHeight: 18 },
});
