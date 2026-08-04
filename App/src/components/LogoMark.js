// Reusable Aviate brand mark. Single source of truth for the logo image so
// we only `require()` the asset once across the app.
import React from 'react';
import { Image, StyleSheet } from 'react-native';

const LOGO = require('../../assets/logo.png');

export default function LogoMark({ size = 28, style }) {
  return (
    <Image
      source={LOGO}
      accessible
      accessibilityLabel="Aviate"
      resizeMode="contain"
      style={[{ width: size, height: size }, styles.img, style]}
    />
  );
}

const styles = StyleSheet.create({
  img: { backgroundColor: 'transparent' },
});
