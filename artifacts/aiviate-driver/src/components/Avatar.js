import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

export default function Avatar({ uri, initials = '?', size = 38, fontSize, style }) {
  const [failed, setFailed] = useState(false);
  const radius = size / 2;
  const txtSize = fontSize || Math.round(size * 0.38);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        style={[
          { width: size, height: size, borderRadius: radius, backgroundColor: COLORS.teal },
          style,
        ]}
      />
    );
  }
  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: txtSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: COLORS.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: '#fff', fontWeight: '700' },
});
