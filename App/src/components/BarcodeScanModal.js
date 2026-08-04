// Full-screen barcode scan modal used to confirm pickup / delivery.
// Native: opens the camera (expo-camera CameraView) and listens for a barcode
// scan, validates against the expected code, and calls onConfirm on a match.
// Web: shows a manual entry field (browser barcode APIs are too inconsistent
// for a reliable cross-browser experience).
//
// Props:
//   visible            – boolean, controls modal visibility
//   expectedBarcode    – the code that must be matched
//   stopLabel          – e.g. "Pickup at Sandton City Mall" (shown in header)
//   onClose            – called on cancel
//   onConfirm(code)    – called with the matched code on success
import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { haptic } from '../utils/haptics';

const USE_CAMERA = Platform.OS !== 'web';

// Lazy-load expo-camera only on native so the web bundle stays slim.
let CameraView = null;
let useCameraPermissions = null;
if (USE_CAMERA) {
  try {
    const cam = require('expo-camera');
    CameraView = cam.CameraView;
    useCameraPermissions = cam.useCameraPermissions;
  } catch (_e) {
    // expo-camera not available — fall back to manual entry path.
  }
}

const normalize = (s) => String(s || '').trim().toUpperCase();

export default function BarcodeScanModal({
  visible,
  expectedBarcode,
  stopLabel,
  onClose,
  onConfirm,
}) {
  if (USE_CAMERA && CameraView) {
    return (
      <NativeScanner
        visible={visible}
        expectedBarcode={expectedBarcode}
        stopLabel={stopLabel}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
  }
  return (
    <ManualEntryScanner
      visible={visible}
      expectedBarcode={expectedBarcode}
      stopLabel={stopLabel}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

/* -------------------- Native (camera) -------------------- */
function NativeScanner({ visible, expectedBarcode, stopLabel, onClose, onConfirm }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(null); // { code, ok }
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState('');

  // Reset transient state on open/close.
  useEffect(() => {
    if (visible) {
      setScanned(null);
      setManualOpen(false);
      setManual('');
    }
  }, [visible]);

  const handleBarcode = useCallback(
    ({ data }) => {
      if (scanned) return; // single-shot
      const ok = normalize(data) === normalize(expectedBarcode);
      setScanned({ code: data, ok });
      if (ok) {
        haptic.success();
        // brief moment to show success state before confirming
        setTimeout(() => onConfirm(data), 450);
      } else {
        haptic.error();
      }
    },
    [scanned, expectedBarcode, onConfirm],
  );

  const submitManual = () => {
    const ok = normalize(manual) === normalize(expectedBarcode);
    if (ok) {
      haptic.success();
      onConfirm(manual);
    } else {
      haptic.error();
      setScanned({ code: manual, ok: false });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fullDark}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} accessibilityLabel="Cancel scan">
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle} numberOfLines={1}>Scan package</Text>
            {!!stopLabel && <Text style={styles.headerSub} numberOfLines={1}>{stopLabel}</Text>}
          </View>
          <TouchableOpacity
            onPress={() => setManualOpen((v) => !v)}
            style={styles.headerBtn}
            accessibilityLabel="Enter barcode manually"
          >
            <Ionicons name="keypad-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {!permission ? (
          <View style={styles.center}><ActivityIndicator color="#fff" /></View>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Ionicons name="camera-outline" size={42} color="#fff" />
            <Text style={styles.permTitle}>Camera permission needed</Text>
            <Text style={styles.permSub}>
              Aviate needs your camera to scan package barcodes for pickup and delivery confirmation.
            </Text>
            <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>Allow camera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: [
                  'qr', 'code128', 'code39', 'code93',
                  'ean13', 'ean8', 'upc_a', 'upc_e',
                  'pdf417', 'itf14', 'datamatrix', 'aztec',
                ],
              }}
              onBarcodeScanned={scanned?.ok ? undefined : handleBarcode}
            />
            <View style={styles.reticleWrap} pointerEvents="none">
              <View style={[styles.reticle, scanned?.ok && styles.reticleOk, scanned && !scanned.ok && styles.reticleBad]} />
            </View>
            <View style={styles.hintBar} pointerEvents="none">
              <Text style={styles.hintText}>
                {scanned?.ok
                  ? 'Match — confirming…'
                  : scanned && !scanned.ok
                    ? `Wrong package · expected ${expectedBarcode}`
                    : 'Align the package barcode inside the frame'}
              </Text>
            </View>
            {scanned && !scanned.ok && (
              <TouchableOpacity style={styles.retryBtn} onPress={() => setScanned(null)}>
                <Text style={styles.retryBtnText}>Scan again</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {manualOpen && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.manualWrap}
          >
            <Text style={styles.manualLabel}>Enter barcode manually</Text>
            <TextInput
              autoFocus
              value={manual}
              onChangeText={setManual}
              placeholder="e.g. AVT-2041-S2"
              placeholderTextColor="#7d8893"
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.manualInput}
              onSubmitEditing={submitManual}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.manualBtn} onPress={submitManual}>
              <Text style={styles.manualBtnText}>Confirm code</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

/* -------------------- Web / fallback (manual entry) -------------------- */
function ManualEntryScanner({ visible, expectedBarcode, stopLabel, onClose, onConfirm }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) { setCode(''); setError(null); }
  }, [visible]);

  const submit = () => {
    if (normalize(code) === normalize(expectedBarcode)) {
      onConfirm(code);
    } else {
      setError(`That barcode doesn't match. Expected ${expectedBarcode}.`);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalScrim}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Ionicons name="barcode-outline" size={22} color={COLORS.teal} />
            <Text style={styles.sheetTitle}>Scan package</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Cancel">
              <Ionicons name="close" size={22} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>
          {!!stopLabel && <Text style={styles.sheetSub}>{stopLabel}</Text>}
          <Text style={styles.sheetHint}>
            On a phone the camera opens automatically. In this preview, enter the package barcode below.
          </Text>
          <Text style={styles.expectedBadge}>
            Expected: <Text style={styles.expectedCode}>{expectedBarcode}</Text>
          </Text>
          <TextInput
            value={code}
            onChangeText={(v) => { setCode(v); if (error) setError(null); }}
            placeholder="Enter or paste barcode"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.sheetInput}
            onSubmitEditing={submit}
            returnKeyType="done"
            autoFocus
          />
          {error && <Text style={styles.sheetError}>{error}</Text>}
          <View style={styles.sheetActions}>
            <TouchableOpacity style={[styles.sheetBtn, styles.sheetBtnGhost]} onPress={onClose}>
              <Text style={[styles.sheetBtnText, { color: COLORS.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sheetBtn, styles.sheetBtnPrimary]} onPress={submit}>
              <Text style={[styles.sheetBtnText, { color: '#fff' }]}>Confirm code</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullDark: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  headerBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingHorizontal: 12, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  headerBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },

  permTitle: { color: '#fff', fontWeight: '700', fontSize: 18, marginTop: 14, textAlign: 'center' },
  permSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 18 },
  permBtn: { marginTop: 22, backgroundColor: COLORS.teal, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  permBtnText: { color: '#fff', fontWeight: '700' },

  cameraWrap: { flex: 1, backgroundColor: '#000' },
  reticleWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 250, height: 160, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 16 },
  reticleOk: { borderColor: '#0A8754' },
  reticleBad: { borderColor: COLORS.danger },

  hintBar: {
    position: 'absolute', bottom: 110, left: 24, right: 24,
    backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 10,
    alignItems: 'center',
  },
  hintText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  retryBtn: {
    position: 'absolute', bottom: 50, alignSelf: 'center',
    backgroundColor: '#fff', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12,
  },
  retryBtnText: { color: COLORS.text, fontWeight: '700' },

  manualWrap: {
    backgroundColor: '#101418', padding: 16, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: '#222',
  },
  manualLabel: { color: '#fff', fontWeight: '600', marginBottom: 8 },
  manualInput: {
    backgroundColor: '#1c2128', color: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10,
  },
  manualBtn: { backgroundColor: COLORS.teal, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  manualBtnText: { color: '#fff', fontWeight: '700' },

  /* web / fallback sheet */
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 20, width: '100%', maxWidth: 420 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.text },
  sheetSub: { fontSize: 13, color: COLORS.textDim, marginBottom: 12 },
  sheetHint: { fontSize: 12, color: COLORS.textDim, lineHeight: 17, marginBottom: 12 },
  expectedBadge: {
    fontSize: 12, color: COLORS.textDim, marginBottom: 8,
  },
  expectedCode: { color: COLORS.teal, fontWeight: '800', letterSpacing: 0.4 },
  sheetInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  sheetError: { color: COLORS.danger, fontSize: 12, marginTop: 8 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sheetBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  sheetBtnGhost: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border },
  sheetBtnPrimary: { backgroundColor: COLORS.teal },
  sheetBtnText: { fontWeight: '700', fontSize: 14 },
});
