import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
  Platform,
} from 'react-native';

const USE_NATIVE = Platform.OS !== 'web';
import { Ionicons } from '@expo/vector-icons';
import { useJobs } from '../contexts/JobsContext';
import { useToast } from '../contexts/ToastContext';
import ScreenHeader from '../components/ScreenHeader';
import PressableCard from '../components/PressableCard';
import AnimatedProgress from '../components/AnimatedProgress';
import { SkeletonCard } from '../components/Skeleton';
import { haptic } from '../utils/haptics';
import { COLORS } from '../theme';

const statusLabel = {
  assigned: 'Ready to start',
  in_progress: 'In progress',
};

function FadeIn({ children, delay = 0 }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 360, delay, useNativeDriver: USE_NATIVE, easing: Easing.out(Easing.quad) }),
      Animated.timing(ty, { toValue: 0, duration: 360, delay, useNativeDriver: USE_NATIVE, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }, [delay, opacity, ty]);
  return <Animated.View style={{ opacity, transform: [{ translateY: ty }] }}>{children}</Animated.View>;
}

export default function JobsScreen({ navigation }) {
  const { newRoutes, assignedRoutes, loading, accept, reload, setActiveRouteId } = useJobs();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    await reload();
    setRefreshing(false);
  }, [reload]);

  const handleAccept = async (route) => {
    setAcceptingId(route.id);
    haptic.medium();
    try {
      await accept(route.id);
      haptic.success();
      toast.success(`Accepted ${route.id}`);
      navigation.navigate('Active');
    } catch (e) {
      haptic.error();
      toast.error('Could not accept route');
    } finally {
      setAcceptingId(null);
    }
  };

  const openActive = (route) => {
    setActiveRouteId(route.id);
    navigation.navigate('Active');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Routes" subtitle="Loading…" />
        <View style={styles.scroll}>
          <Text style={styles.sectionTitle}>From dispatch</Text>
          <SkeletonCard />
          <SkeletonCard />
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Your assigned routes</Text>
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="Routes"
        subtitle={`${newRoutes.length} new · ${assignedRoutes.length} assigned`}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.teal}
            colors={[COLORS.teal]}
          />
        }
      >
        <Text style={styles.sectionTitle}>From dispatch</Text>
        {newRoutes.length === 0 ? (
          <FadeIn>
            <View style={styles.empty}>
              <Ionicons name="checkmark-done" size={20} color={COLORS.textDim} />
              <Text style={styles.emptyText}>No new routes from dispatch</Text>
            </View>
          </FadeIn>
        ) : (
          newRoutes.map((route, i) => (
            <FadeIn key={route.id} delay={i * 60}>
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <View>
                    <Text style={styles.routeId}>{route.id}</Text>
                    <Text style={styles.routeAssigner}>{route.assigned_by}</Text>
                  </View>
                  <View style={styles.optimizedPill}>
                    <Ionicons name="sparkles" size={11} color={COLORS.textDim} />
                    <Text style={styles.optimizedText}>Optimized</Text>
                  </View>
                </View>

                <View style={styles.stopsList}>
                  {route.stops.slice(0, 3).map((stop, idx) => (
                    <View key={stop.id} style={styles.stopRow}>
                      <View style={[styles.stopDot, stop.type === 'pickup' && styles.stopDotPickup]}>
                        <Text style={styles.stopDotText}>{idx + 1}</Text>
                      </View>
                      <Text style={styles.stopText} numberOfLines={1}>{stop.address}</Text>
                    </View>
                  ))}
                  {route.stops.length > 3 && (
                    <Text style={styles.moreStops}>+{route.stops.length - 3} more stops</Text>
                  )}
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="cube-outline" size={14} color={COLORS.textDim} />
                    <Text style={styles.metaText}>{route.stops.length} stops</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="navigate-outline" size={14} color={COLORS.textDim} />
                    <Text style={styles.metaText}>{route.total_distance_km} km</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={COLORS.textDim} />
                    <Text style={styles.metaText}>{route.total_duration_min} min</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.acceptBtn, acceptingId === route.id && styles.acceptBtnBusy]}
                  onPress={() => handleAccept(route)}
                  activeOpacity={0.85}
                  disabled={acceptingId === route.id}
                >
                  {acceptingId === route.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.acceptText}>Accept route</Text>
                  )}
                </TouchableOpacity>
              </View>
            </FadeIn>
          ))
        )}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Your assigned routes</Text>
        {assignedRoutes.length === 0 ? (
          <FadeIn>
            <View style={styles.empty}>
              <Ionicons name="map-outline" size={20} color={COLORS.textDim} />
              <Text style={styles.emptyText}>No assigned routes</Text>
            </View>
          </FadeIn>
        ) : (
          assignedRoutes.map((route, i) => {
            const completed = route.stops.filter((s) => s.completed).length;
            return (
              <FadeIn key={route.id} delay={i * 60}>
                <PressableCard
                  style={styles.card}
                  onPress={() => openActive(route)}
                  hapticType="light"
                >
                  <View style={styles.cardHead}>
                    <View>
                      <Text style={styles.routeId}>{route.id}</Text>
                      <Text style={styles.routeAssigner}>{route.assigned_by}</Text>
                    </View>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>{statusLabel[route.status]}</Text>
                    </View>
                  </View>
                  <AnimatedProgress value={completed / route.stops.length} />
                  <Text style={styles.progressText}>
                    {completed} of {route.stops.length} stops complete
                  </Text>
                </PressableCard>
              </FadeIn>
            );
          })
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginLeft: 4 },
  empty: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  emptyText: { color: COLORS.textDim, fontSize: 13 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  routeId: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  routeAssigner: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },
  optimizedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.fill, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  optimizedText: { color: COLORS.textDim, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  stopsList: { marginBottom: 12, gap: 6 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.fill, alignItems: 'center', justifyContent: 'center' },
  stopDotPickup: { backgroundColor: COLORS.fill },
  stopDotText: { color: COLORS.text, fontSize: 11, fontWeight: '700' },
  stopText: { flex: 1, fontSize: 12, color: COLORS.text },
  moreStops: { fontSize: 11, color: COLORS.textDim, marginLeft: 28, fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { color: COLORS.textDim, fontSize: 12 },
  acceptBtn: { backgroundColor: COLORS.teal, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  acceptBtnBusy: { backgroundColor: COLORS.tealDark },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  statusPill: { backgroundColor: COLORS.fill, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusPillText: { color: COLORS.text, fontSize: 11, fontWeight: '600' },
  progressText: { fontSize: 11, color: COLORS.textDim, marginTop: 8 },
});
