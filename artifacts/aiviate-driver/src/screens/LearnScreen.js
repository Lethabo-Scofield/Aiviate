import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { useTour } from '../contexts/TourContext';
import { haptic } from '../utils/haptics';
import { COLORS } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const GUIDES = [
  {
    icon: 'log-in-outline',
    title: 'Signing in',
    steps: [
      'Your company would have given you a login email and a temporary password, or sent you an activation link by email. Use those to sign in.',
      'No details yet? Ask your dispatcher. They create driver accounts in Aiviate Dispatch.',
      'Forgot your password? Tap “Forgot password?” on the sign-in screen, or ask your dispatcher to reset it.',
    ],
  },
  {
    icon: 'bed-outline',
    title: 'Your daily pre-drive check-in',
    steps: [
      'Before your first route each day, answer four quick questions: how much you slept, how alert you feel, how long you’ve been awake, and anything else affecting you.',
      'If your answers show a fatigue risk, dispatch is notified so they can plan rest or a handover. Honest answers never count against you.',
      'Felt fine this morning but tired now? Tap the check-in card again.',
    ],
  },
  {
    icon: 'map-outline',
    title: 'Accepting a route',
    steps: [
      'New routes from dispatch appear under Routes → From dispatch.',
      'Check the stops, distance and time, then tap Accept route.',
    ],
  },
  {
    icon: 'navigate-outline',
    title: 'Delivering',
    steps: [
      'Open Active to see your stops in the best order.',
      'Tap to navigate, read the customer notes, and scan the parcel at the door.',
      'Complete the stop with the recipient’s name. No signal? It saves and syncs later.',
    ],
  },
  {
    icon: 'chatbubbles-outline',
    title: 'Using Community',
    steps: [
      'Post road updates and safety warnings so other drivers can avoid them.',
      'Ask questions and read notices from dispatch.',
      'Never post customers’ names, phone numbers or addresses.',
    ],
  },
];

const CAUSES = [
  'Less than 7 hours of sleep',
  'Being awake more than 16 hours',
  'Drowsy medication (allergy, cold and some pain tablets)',
  'Skipped meals or not drinking water',
  'Illness, pain or stress',
  'Alcohol, even the night before',
  'The afternoon dip (14:00–16:00) and early morning (02:00–06:00)',
];

const SIGNS = [
  'Yawning a lot or heavy eyelids',
  'Drifting out of your lane',
  'Missing a turn, sign or exit',
  'Can’t remember the last few kilometres',
];

function Guide({ guide, open, onToggle }) {
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.guideHead} onPress={onToggle} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={styles.iconWrap}>
          <Ionicons name={guide.icon} size={18} color={COLORS.teal} />
        </View>
        <Text style={styles.guideTitle}>{guide.title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textTertiary} />
      </TouchableOpacity>
      {open && (
        <View style={styles.steps}>
          {guide.steps.map((s, i) => (
            <View key={s} style={styles.stepRow}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Bullets({ title, items }) {
  return (
    <View style={[styles.card, styles.padded]}>
      <Text style={styles.bulletTitle}>{title}</Text>
      {items.map((t) => (
        <View key={t} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export default function LearnScreen() {
  const { replay } = useTour();
  const [openIdx, setOpenIdx] = useState(0);

  const toggle = (i) => {
    haptic.selection();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIdx(openIdx === i ? -1 : i);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Learn" subtitle="How to use Aiviate Driver" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.tourBtn} onPress={replay} activeOpacity={0.85} accessibilityRole="button" testID="learn-replay-tour">
          <Ionicons name="play-circle-outline" size={20} color={COLORS.teal} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tourTitle}>Replay app tour</Text>
            <Text style={styles.tourSub}>A one-minute walk through every tab</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Guides</Text>
        {GUIDES.map((g, i) => <Guide key={g.title} guide={g} open={openIdx === i} onToggle={() => toggle(i)} />)}

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Staying alert on the road</Text>
        <Bullets title="What makes drivers tired" items={CAUSES} />
        <Bullets title="Warning signs" items={SIGNS} />
        <View style={[styles.card, styles.padded, styles.callout]}>
          <Text style={styles.bulletTitle}>If you notice the signs</Text>
          <Text style={styles.bulletText}>
            Pull over somewhere safe, take a 15–20 minute nap and drink water, then tell dispatch.
            Opening the window, loud music and coffee don’t fix tiredness. Only rest does.
          </Text>
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginLeft: 4 },
  tourBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(0,128,128,0.35)', marginBottom: 20 },
  tourTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  tourSub: { fontSize: 12, color: COLORS.textDim, marginTop: 2 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 },
  padded: { padding: 14 },
  callout: { borderColor: 'rgba(0,128,128,0.35)' },
  guideHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 56 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(0,128,128,0.10)', alignItems: 'center', justifyContent: 'center' },
  guideTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  steps: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  stepRow: { flexDirection: 'row', gap: 10 },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.teal, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20, color: COLORS.text },
  bulletTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  bulletRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  bulletDot: { color: COLORS.textDim, fontSize: 14, lineHeight: 20 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 20, color: COLORS.textDim },
});
