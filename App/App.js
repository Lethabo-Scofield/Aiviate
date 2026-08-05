import React, { useEffect, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

import { AuthProvider } from './src/contexts/AuthContext';
import { DriverProvider } from './src/contexts/DriverContext';
import { NotificationsProvider } from './src/contexts/NotificationsContext';
import { JobsProvider } from './src/contexts/JobsContext';
import { ToastProvider } from './src/contexts/ToastContext';
import RootNavigator from './src/navigation/RootNavigator';
import LogoMark from './src/components/LogoMark';
import { applyFontPatch } from './src/utils/fontPatch';
import { COLORS } from './src/theme';

// Keep the native splash visible while we load fonts so users see the brand
// mark during cold starts instead of a flash of unstyled text.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (fontsLoaded || fontError) {
    applyFontPatch();
  }

  const onReady = useCallback(async () => {
    if (fontsLoaded || fontError) {
      try { await SplashScreen.hideAsync(); } catch {}
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => { onReady(); }, [onReady]);

  if (!fontsLoaded && !fontError) {
    if (Platform.OS === 'web') {
      return (
        <View style={styles.loader}>
          <View style={styles.loaderBadge}>
            <ActivityIndicator color={COLORS.tint} size="large" style={StyleSheet.absoluteFill} />
            <LogoMark size={56} />
          </View>
        </View>
      );
    }
    return null;
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <AuthProvider>
          <DriverProvider>
            <NotificationsProvider>
              <JobsProvider>
                <RootNavigator />
              </JobsProvider>
            </NotificationsProvider>
          </DriverProvider>
        </AuthProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The badge wraps the logo and lets the spinner orbit around it via
  // absoluteFill so the ring sits centered on the brand mark.
  loaderBadge: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
