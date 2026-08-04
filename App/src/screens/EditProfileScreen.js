import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import ModalHeader from '../components/ModalHeader';
import Avatar from '../components/Avatar';
import { useDriver } from '../contexts/DriverContext';
import { useToast } from '../contexts/ToastContext';
import { haptic } from '../utils/haptics';
import { COLORS } from '../theme';

// Lightweight client-side validation. The screen only stores changes locally
// (no backend in the preview build), but we still gate Save on basic format
// checks so users get instant feedback like a real iOS app.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s\-()]{6,}$/;

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize, error, last }) {
  return (
    <View style={[styles.field, !last && styles.fieldDivider]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={styles.input}
        returnKeyType="done"
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export default function EditProfileScreen({ navigation }) {
  const { driver, updateDriver } = useDriver();
  const { toast } = useToast();

  const [name, setName] = useState(driver?.name || '');
  const [phone, setPhone] = useState(driver?.phone || '');
  const [email, setEmail] = useState(driver?.email || '');
  const [vehicle, setVehicle] = useState(driver?.vehicle || '');
  const [plate, setPlate] = useState(driver?.vehicle_plate || '');

  const errors = useMemo(() => {
    const e = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!phone.trim()) e.phone = 'Phone is required';
    else if (!PHONE_RE.test(phone.trim())) e.phone = 'Enter a valid phone number';
    if (!email.trim()) e.email = 'Email is required';
    else if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email';
    if (!vehicle.trim()) e.vehicle = 'Vehicle is required';
    if (!plate.trim()) e.plate = 'Plate is required';
    return e;
  }, [name, phone, email, vehicle, plate]);

  const dirty =
    name !== driver?.name ||
    phone !== driver?.phone ||
    email !== driver?.email ||
    vehicle !== driver?.vehicle ||
    plate !== driver?.vehicle_plate;

  const canSave = dirty && Object.keys(errors).length === 0;

  const handleSave = () => {
    if (!canSave) return;
    updateDriver({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      vehicle: vehicle.trim(),
      vehicle_plate: plate.trim().toUpperCase(),
    });
    haptic.success();
    toast.success('Profile updated');
    navigation.goBack();
  };

  if (!driver) return <SafeAreaView style={styles.container} />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ModalHeader
        title="Edit profile"
        onBack={() => navigation.goBack()}
        rightLabel={canSave ? 'Save' : undefined}
        onRightPress={handleSave}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={20}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarBlock}>
            <Avatar uri={driver.avatar_url} initials={driver.initials} size={88} fontSize={30} />
            <Text style={styles.empId}>{driver.employee_id}</Text>
            <Text style={styles.idHint}>Employee ID can't be changed</Text>
          </View>

          <Text style={styles.sectionTitle}>Personal</Text>
          <View style={styles.card}>
            <Field
              label="Full name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoCapitalize="words"
              error={errors.name}
            />
            <Field
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="+27 ..."
              keyboardType="phone-pad"
              error={errors.phone}
            />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              last
            />
          </View>

          <Text style={styles.sectionTitle}>Vehicle</Text>
          <View style={styles.card}>
            <Field
              label="Model"
              value={vehicle}
              onChangeText={setVehicle}
              placeholder="e.g. Toyota Hilux"
              autoCapitalize="words"
              error={errors.vehicle}
            />
            <Field
              label="Plate"
              value={plate}
              onChangeText={setPlate}
              placeholder="ABC 123 GP"
              autoCapitalize="characters"
              error={errors.plate}
              last
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={!canSave}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>Save changes</Text>
          </TouchableOpacity>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16 },

  avatarBlock: { alignItems: 'center', marginBottom: 18 },
  empId: { marginTop: 10, fontSize: 13, color: COLORS.text, fontWeight: '600' },
  idHint: { marginTop: 2, fontSize: 11, color: COLORS.textDim },

  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: COLORS.textDim,
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 8, marginLeft: 4, marginTop: 6,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  field: { paddingVertical: 12 },
  fieldDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  fieldLabel: {
    fontSize: 11, color: COLORS.textDim,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    fontSize: 15, color: COLORS.text, fontWeight: '500',
    paddingVertical: Platform.OS === 'web' ? 4 : 2,
    minHeight: 22,
  },
  errorText: { fontSize: 12, color: COLORS.danger, marginTop: 4 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, borderRadius: 14,
    backgroundColor: COLORS.tint,
    marginTop: 4,
  },
  saveBtnDisabled: { backgroundColor: COLORS.textTertiary },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
