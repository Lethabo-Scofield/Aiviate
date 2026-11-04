import React, { useEffect, useRef } from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { COLORS } from '../theme';
import { bearingDeg } from '../utils/geo';

const PIN_COLOR = {
  pickup: COLORS.teal,
  dropoff: COLORS.navy,
  done: '#9AA8B2',
};

export default function RouteMap({
  stops,
  currentIndex,
  polyline,
  style,
  focusActive = false,
  driverLocation = null,
  driverLeg = null,
}) {
  const mapRef = useRef(null);

  const points = stops.map((s) => ({ latitude: s.lat, longitude: s.lng }));
  const polyCoords = polyline || points;
  const activeStop = currentIndex >= 0 && currentIndex < stops.length ? stops[currentIndex] : null;
  const focusCoord = focusActive && activeStop ? { lat: activeStop.lat, lng: activeStop.lng } : null;

  // Camera priority: driver location during nav > active stop > overview.
  const navTarget = focusActive
    ? driverLocation || (activeStop && { lat: activeStop.lat, lng: activeStop.lng })
    : null;

  const initialRegion = {
    latitude: navTarget ? navTarget.lat : stops[0].lat,
    longitude: navTarget ? navTarget.lng : stops[0].lng,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!mapRef.current) return;
    const t = setTimeout(() => {
      if (focusActive && navTarget && activeStop) {
        const heading = bearingDeg(navTarget, { lat: activeStop.lat, lng: activeStop.lng });
        mapRef.current?.animateCamera?.(
          {
            center: { latitude: navTarget.lat, longitude: navTarget.lng },
            heading,
            pitch: 60,
            zoom: 16,
          },
          { duration: 700 },
        );
      } else if (navTarget) {
        mapRef.current?.animateToRegion?.(
          { latitude: navTarget.lat, longitude: navTarget.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 },
          800,
        );
      } else if (points.length >= 2) {
        mapRef.current?.fitToCoordinates?.(points, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [navTarget?.lat, navTarget?.lng, activeStop?.lat, activeStop?.lng, focusActive, JSON.stringify(points)]);

  if (Platform.OS === 'web') {
    return (
      <MapView
        style={style}
        initialRegion={initialRegion}
        fitToPoints={stops.map((s) => ({ lat: s.lat, lng: s.lng }))}
        focusCoord={focusCoord}
        focusZoom={16}
        driverLocation={driverLocation}
      >
        <Polyline coordinates={polyCoords} strokeColor={COLORS.teal} strokeWidth={5} />
        {driverLeg && driverLeg.length >= 2 && (
          <Polyline coordinates={driverLeg} strokeColor="#1E88FF" strokeWidth={4} />
        )}
        {stops.map((s, i) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            label={String(i + 1)}
            variant={s.completed ? 'done' : s.type}
            active={i === currentIndex && !s.completed}
          />
        ))}
      </MapView>
    );
  }

  return (
    <MapView
      ref={mapRef}
      style={style}
      initialRegion={initialRegion}
      showsUserLocation={!driverLocation}
      followsUserLocation={focusActive && !driverLocation}
      showsMyLocationButton={false}
    >
      <Polyline coordinates={polyCoords} strokeColor={COLORS.teal} strokeWidth={5} />
      {driverLeg && driverLeg.length >= 2 && (
        <Polyline
          coordinates={driverLeg}
          strokeColor="#1E88FF"
          strokeWidth={4}
          lineDashPattern={[8, 6]}
        />
      )}
      {stops.map((s, i) => {
        const variant = s.completed ? 'done' : s.type;
        const isActive = i === currentIndex && !s.completed;
        return (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            pinColor={PIN_COLOR[variant]}
            title={`Stop ${i + 1}`}
            description={s.address}
          >
            <View style={[styles.pin, { backgroundColor: PIN_COLOR[variant] }, isActive && styles.pinActive]}>
              <Text style={styles.pinText}>{i + 1}</Text>
            </View>
          </Marker>
        );
      })}
      {driverLocation && (
        <Marker
          coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          tracksViewChanges
        >
          <View style={styles.puckOuter}>
            <View style={styles.puckInner} />
          </View>
        </Marker>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  pinActive: { transform: [{ scale: 1.15 }] },
  pinText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  puckOuter: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,136,255,0.22)',
  },
  puckInner: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#1E88FF',
    borderWidth: 2, borderColor: '#fff',
  },
});
