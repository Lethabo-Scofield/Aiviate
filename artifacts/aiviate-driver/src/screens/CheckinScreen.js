import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ModalHeader from '../components/ModalHeader';
import { RISK } from '../components/CheckinCard';
import * as backend from '../services/backend';
import { ApiError } from '../services/http';
import { haptic } from '../utils/haptics';
import { COLORS } from '../theme';

// Pre-drive fatigue check-in. Questions come from the server, which also
// scores the answers and notifies dispatch when the risk is medium or high.
export default function CheckinScreen({ navigation }) {
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    backend.getWellnessQuestions()
      .then(setQuestions)
      .catch((e) => setError(
        e instanceof ApiError && e.status === 404
          ? 'The check-in is not available on your company’s server yet. Tell your dispatcher how you feel before driving.'
          : e.message || 'Could not load the check-in.',
      ));
  }, []);

  const q = questions?.[step];
  const picked = q ? answers[q.id] : null;
  const answered = q && (q.multi ? (picked || []).length > 0 : Boolean(picked));

  const toggle = (optionId) => {
    haptic.selection();
    setAnswers((prev) => {
      if (!q.multi) return { ...prev, [q.id]: optionId };
      const current = prev[q.id] || [];
      if (optionId === 'none') return { ...prev, [q.id]: ['none'] };
      const without = current.filter((id) => id !== 'none' && id !== optionId);
      return { ...prev, [q.id]: current.includes(optionId) ? without : [...without, optionId] };
    });
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await backend.submitCheckin(answers);
      if (res.risk_level === 'low') haptic.success(); else haptic.warning();
      setResult(res);
    } catch (e) {
      haptic.error();
      setError(e.message || 'Could not save your check-in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ModalHeader title="Pre-drive check-in" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {result ? (
          <Result result={result} onDone={() => navigation.goBack()} />
        ) : !questions ? (
          error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={COLORS.teal} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={styles.progress}>Question {step + 1} of {questions.length}</Text>
            <Text style={styles.prompt}>{q.prompt}</Text>
            {q.multi && <Text style={styles.hint}>Pick all that apply.</Text>}

            <View style={{ gap: 10, marginTop: 16 }}>
              {q.options.map((o) => {
                const selected = q.multi ? (picked || []).includes(o.id) : picked === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => toggle(o.id)}
                    activeOpacity={0.85}
                    accessibilityRole={q.multi ? 'checkbox' : 'radio'}
                    accessibilityState={{ checked: selected }}
                  >
                    <Ionicons
                      name={selected ? (q.multi ? 'checkbox' : 'radio-button-on') : (q.multi ? 'square-outline' : 'radio-button-off')}
                      size={20}
                      color={selected ? '#fff' : COLORS.textTertiary}
                    />
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, step === 0 && { opacity: 0.4 }]}
                disabled={step === 0}
                onPress={() => setStep(step - 1)}
              >
                <Text style={styles.secondaryText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, (!answered || busy) && styles.primaryDisabled]}
                disabled={!answered || busy}
                onPress={() => (step < questions.length - 1 ? setStep(step + 1) : submit())}
              >
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.primaryText}>{step < questions.length - 1 ? 'Next' : 'Submit'}</Text>
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.footnote}>Honest answers keep you and others safe. They never count against you.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Result({ result, onDone }) {
  const risk = RISK[result.risk_level] || RISK.low;
  return (
    <View style={styles.resultCard}>
      <Ionicons name={risk.icon} size={44} color={risk.color} />
      <Text style={styles.resultTitle}>{risk.label}</Text>
      <Text style={styles.resultBody}>{result.advice}</Text>
      {result.checkin?.reasons?.length ? (
        <Text style={styles.reasons}>You mentioned: {result.checkin.reasons.join(', ')}.</Text>
      ) : null}
      <TouchableOpacity style={[styles.primaryBtn, { alignSelf: 'stretch', marginTop: 20 }]} onPress={onDone}>
        <Text style={styles.primaryText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 18 },
  progress: { fontSize: 12, fontWeight: '700', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 0.5 },
  prompt: { fontSize: 21, fontWeight: '800', color: COLORS.text, marginTop: 8, lineHeight: 27 },
  hint: { fontSize: 13, color: COLORS.textDim, marginTop: 4 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.borderStrong, minHeight: 56,
  },
  optionSelected: { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  optionText: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '600' },
  optionTextSelected: { color: '#fff' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, gap: 12 },
  secondaryBtn: { flex: 1, paddingVertical: 15, borderRadius: 14, backgroundColor: COLORS.fill, alignItems: 'center' },
  secondaryText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  primaryBtn: { flex: 2, paddingVertical: 15, borderRadius: 14, backgroundColor: COLORS.teal, alignItems: 'center' },
  primaryDisabled: { backgroundColor: '#9AA8B2' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  footnote: { fontSize: 12, color: COLORS.textDim, textAlign: 'center', marginTop: 18 },
  error: { color: COLORS.danger, fontSize: 14, marginTop: 16, lineHeight: 20 },
  resultCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginTop: 8 },
  resultTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 12 },
  resultBody: { fontSize: 15, lineHeight: 22, color: COLORS.textDim, textAlign: 'center', marginTop: 8 },
  reasons: { fontSize: 13, color: COLORS.textTertiary, textAlign: 'center', marginTop: 12 },
});
