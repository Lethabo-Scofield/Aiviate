import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import LogoMark from '../components/LogoMark';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { haptic } from '../utils/haptics';
import { COLORS } from '../theme';
import { DEFAULT_DRIVER_EMAIL, DEFAULT_DRIVER_PASSWORD } from '../config';

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState(DEFAULT_DRIVER_EMAIL);
  const [password, setPassword] = useState(DEFAULT_DRIVER_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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

        <View style={styles.hint}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.teal} />
          <Text style={styles.hintText}>
            Your company would have given you a login email and a temporary password to sign in.
          </Text>
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

        <View style={styles.help}>
          <TouchableOpacity
            style={styles.helpHead}
            onPress={() => setHelpOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: helpOpen }}
          >
            <Text style={styles.helpTitle}>First time signing in?</Text>
            <Ionicons name={helpOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textDim} />
          </TouchableOpacity>
          {helpOpen && (
            <View style={{ gap: 10, marginTop: 10 }}>
              <Text style={styles.helpText}>
                <Text style={styles.helpStrong}>Got an email and temporary password? </Text>
                Enter them above. Your dispatcher created your account and shared them with you.
              </Text>
              <Text style={styles.helpText}>
                <Text style={styles.helpStrong}>Got an activation email? </Text>
                Open the link on this phone to choose your own password.
              </Text>
              <Text style={styles.helpText}>
                <Text style={styles.helpStrong}>Got nothing yet? </Text>
                Ask your dispatcher to add you as a driver in Aiviate Dispatch.
              </Text>
              <Text style={styles.helpText}>
                After you sign in, a short tour shows you around the app.
              </Text>
            </View>
          )}
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
  hint: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: 'rgba(0,128,128,0.08)', borderRadius: 14, padding: 14, marginBottom: 16,
  },
  hintText: { flex: 1, fontSize: 14, lineHeight: 20, color: COLORS.text },
  help: { marginTop: 20, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  helpHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  helpTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  helpText: { fontSize: 13, lineHeight: 19, color: COLORS.textDim },
  helpStrong: { fontWeight: '700', color: COLORS.text },
});
