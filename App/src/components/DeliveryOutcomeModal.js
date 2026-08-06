// Delivery-outcome + proof-of-delivery capture sheet.
//
// Shown once the driver is at the stop. The driver selects an outcome and the
// sheet reveals exactly the evidence that outcome requires (recipient name,
// quantities, damage photo, failure reason, reattempt flag). Submit stays
// disabled until the outcome's required evidence is present, so a stop is never
// completed without its proof. For success outcomes a package barcode scan is
// still required (delegated to the parent via onRequestScan).

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Image, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { OUTCOMES, getOutcome, validateOutcome, outcomeRequiresBarcode } from '../services/outcomes';
import { COLORS } from '../theme';
import { haptic } from '../utils/haptics';

const KIND_COLOR = { success: '#0A8754', partial: COLORS.warning, fail: COLORS.danger };

export default function DeliveryOutcomeModal({
  visible, stop, injectedBarcode, onRequestScan, onClose, onSubmit,
}) {
  const [outcomeKey, setOutcomeKey] = useState('delivered');
  const [recipientName, setRecipientName] = useState('');
  const [deliveredQty, setDeliveredQty] = useState('');
  const [notes, setNotes] = useState('');
  const [evidence, setEvidence] = useState(null);
  const [reattempt, setReattempt] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [picking, setPicking] = useState(false);

  const totalQty = Number(stop?.demand) || 1;

  // Reset per open.
  useEffect(() => {
    if (visible) {
      setOutcomeKey('delivered'); setRecipientName(''); setDeliveredQty('');
      setNotes(''); setEvidence(null); setReattempt(false); setScannedBarcode(null);
    }
  }, [visible]);

  // Pull in a barcode scanned by the parent's scanner.
  useEffect(() => {
    if (injectedBarcode) setScannedBarcode(injectedBarcode);
  }, [injectedBarcode]);

  const outcome = getOutcome(outcomeKey);
  const needsBarcode = outcomeRequiresBarcode(outcomeKey);

  const selectOutcome = (key) => {
    haptic.light();
    setOutcomeKey(key);
    const o = getOutcome(key);
    setReattempt(!!o?.defaultReattempt);
  };

  const capturePhoto = async () => {
    try {
      setPicking(true);
      const onWeb = Platform.OS === 'web';
      const perm = onWeb ? { granted: true } : await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { haptic.error(); setPicking(false); return; }
      const res = onWeb
        ? await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images })
        : await ImagePicker.launchCameraAsync({ quality: 0.6 });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        setEvidence({ uri: a.uri, type: a.mimeType || 'image/jpeg', size: a.fileSize ?? null,
          width: a.width, height: a.height, capturedAt: new Date().toISOString() });
        haptic.success();
      }
    } catch (_e) {
      haptic.error();
    } finally {
      setPicking(false);
    }
  };

  const fieldPayload = { recipientName, notes, deliveredQty, totalQty, evidence };
  const outcomeCheck = validateOutcome(outcomeKey, fieldPayload);
  const barcodeOk = !needsBarcode || !!scannedBarcode;
  const canSubmit = outcomeCheck.ok && barcodeOk && !picking;

  const submit = () => {
    if (!canSubmit) return;
    haptic.medium();
    onSubmit({
      outcome: outcomeKey,
      scannedBarcode: needsBarcode ? scannedBarcode : null,
      recipientName: recipientName.trim() || null,
      deliveredQty: outcome?.requiresQuantity ? Number(deliveredQty) : null,
      totalQty,
      notes: notes.trim() || null,
      evidence,
      reattemptRequired: outcome?.kind === 'fail' ? reattempt : false,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Delivery outcome</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Cancel">
              <Ionicons name="close" size={24} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>
          {!!stop && <Text style={styles.sub} numberOfLines={1}>{stop.address}</Text>}

          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            {/* Outcome grid */}
            <View style={styles.grid}>
              {OUTCOMES.map((o) => {
                const active = o.key === outcomeKey;
                const color = KIND_COLOR[o.kind];
                return (
                  <TouchableOpacity
                    key={o.key}
                    style={[styles.chip, active && { borderColor: color, backgroundColor: `${color}14` }]}
                    onPress={() => selectOutcome(o.key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={o.icon} size={18} color={active ? color : COLORS.textDim} />
                    <Text style={[styles.chipText, active && { color, fontWeight: '700' }]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Barcode (success outcomes) */}
            {needsBarcode && (
              <TouchableOpacity
                style={[styles.row, scannedBarcode ? styles.rowOk : styles.rowAction]}
                onPress={scannedBarcode ? undefined : onRequestScan}
                activeOpacity={scannedBarcode ? 1 : 0.8}
              >
                <Ionicons name={scannedBarcode ? 'checkmark-circle' : 'barcode-outline'} size={20}
                  color={scannedBarcode ? '#0A8754' : COLORS.teal} />
                <Text style={[styles.rowText, scannedBarcode && { color: '#0A8754' }]}>
                  {scannedBarcode ? `Package confirmed · ${scannedBarcode}` : 'Scan package barcode to confirm'}
                </Text>
                {!scannedBarcode && <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />}
              </TouchableOpacity>
            )}

            {/* Recipient */}
            {outcome?.requiresRecipient && (
              <Field label="Recipient name">
                <TextInput style={styles.input} value={recipientName} onChangeText={setRecipientName}
                  placeholder="Who received the delivery?" placeholderTextColor={COLORS.textTertiary} />
              </Field>
            )}

            {/* Partial quantity */}
            {outcome?.requiresQuantity && (
              <Field label={`Items delivered (of ${totalQty})`}>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepBtn}
                    onPress={() => setDeliveredQty((q) => String(Math.max(1, (Number(q) || 1) - 1)))}>
                    <Ionicons name="remove" size={18} color={COLORS.text} />
                  </TouchableOpacity>
                  <TextInput style={styles.stepInput} value={String(deliveredQty)} onChangeText={setDeliveredQty}
                    keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.textTertiary} />
                  <TouchableOpacity style={styles.stepBtn}
                    onPress={() => setDeliveredQty((q) => String(Math.min(totalQty - 1, (Number(q) || 0) + 1)))}>
                    <Ionicons name="add" size={18} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
              </Field>
            )}

            {/* Reattempt (failures) */}
            {outcome?.kind === 'fail' && (
              <TouchableOpacity style={styles.toggleRow} onPress={() => setReattempt((v) => !v)} activeOpacity={0.8}>
                <View style={[styles.checkbox, reattempt && styles.checkboxOn]}>
                  {reattempt && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.toggleText}>Reattempt required</Text>
              </TouchableOpacity>
            )}

            {/* Photo */}
            <Field label={outcome?.requiresPhoto ? 'Photo (required)' : 'Photo (optional)'}>
              {evidence ? (
                <View style={styles.photoWrap}>
                  <Image source={{ uri: evidence.uri }} style={styles.photo} resizeMode="cover" />
                  <TouchableOpacity style={styles.photoRemove} onPress={() => setEvidence(null)}>
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.photoBtn} onPress={capturePhoto} activeOpacity={0.8} disabled={picking}>
                  {picking ? <ActivityIndicator color={COLORS.teal} />
                    : <><Ionicons name="camera-outline" size={18} color={COLORS.teal} />
                        <Text style={styles.photoBtnText}>{Platform.OS === 'web' ? 'Attach photo' : 'Take photo'}</Text></>}
                </TouchableOpacity>
              )}
            </Field>

            {/* Notes / explanation */}
            <Field label={outcome?.requiresExplanation ? 'Explanation (required)' : 'Notes (optional)'}>
              <TextInput style={[styles.input, styles.notes]} value={notes} onChangeText={setNotes}
                placeholder="Anything the dispatcher should know?" placeholderTextColor={COLORS.textTertiary}
                multiline />
            </Field>
          </ScrollView>

          {!outcomeCheck.ok && <Text style={styles.hint}>{outcomeCheck.error}</Text>}
          {outcomeCheck.ok && !barcodeOk && <Text style={styles.hint}>Scan the package barcode to confirm.</Text>}

          <TouchableOpacity
            style={[styles.submit, !canSubmit && styles.submitDisabled,
              outcome && canSubmit && { backgroundColor: KIND_COLOR[outcome.kind] }]}
            onPress={submit} disabled={!canSubmit} activeOpacity={0.85}
          >
            <Text style={styles.submitText}>
              {outcome?.kind === 'success' ? 'Confirm delivery'
                : outcome?.kind === 'partial' ? 'Confirm partial delivery'
                : 'Record outcome'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textDim, marginTop: 2, marginBottom: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: COLORS.surfaceAlt,
  },
  chipText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, marginTop: 10 },
  rowAction: { backgroundColor: 'rgba(0,128,128,0.08)', borderWidth: 1, borderColor: 'rgba(0,128,128,0.25)' },
  rowOk: { backgroundColor: 'rgba(52,199,89,0.10)', borderWidth: 1, borderColor: 'rgba(52,199,89,0.4)' },
  rowText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.teal },

  field: { marginTop: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    fontSize: 15, color: COLORS.text, backgroundColor: COLORS.surfaceAlt,
  },
  notes: { minHeight: 64, textAlignVertical: 'top' },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 42, height: 42, borderRadius: 10, backgroundColor: COLORS.fill, alignItems: 'center', justifyContent: 'center' },
  stepInput: { minWidth: 60, textAlign: 'center', fontSize: 18, fontWeight: '700', color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, paddingVertical: 8 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  toggleText: { fontSize: 14, color: COLORS.text, fontWeight: '600' },

  photoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(0,128,128,0.3)', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 16 },
  photoBtnText: { color: COLORS.teal, fontWeight: '700', fontSize: 14 },
  photoWrap: { position: 'relative' },
  photo: { width: '100%', height: 160, borderRadius: 12, backgroundColor: COLORS.fill },
  photoRemove: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, padding: 6 },

  hint: { color: COLORS.danger, fontSize: 12, marginTop: 12 },
  submit: { marginTop: 16, backgroundColor: COLORS.teal, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitDisabled: { backgroundColor: '#9AA8B2' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
