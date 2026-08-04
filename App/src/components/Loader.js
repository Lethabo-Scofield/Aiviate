import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS } from '../theme';

export default function Loader({ message, inline = false, size = 'large' }) {
  if (inline) {
    return (
      <View style={styles.inline}>
        <ActivityIndicator size="small" color={COLORS.teal} />
        {message ? <Text style={styles.inlineText}>{message}</Text> : null}
      </View>
    );
  }
  return (
    <View style={styles.fullscreen}>
      <ActivityIndicator size={size} color={COLORS.teal} />
      {message ? <Text style={styles.text}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { marginTop: 12, color: COLORS.textDim, fontSize: 13 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  inlineText: { color: COLORS.textDim, fontSize: 12 },
});
