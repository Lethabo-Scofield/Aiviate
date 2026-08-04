// Patches React Native's <Text> and <TextInput> so that any fontWeight in a
// component's style automatically maps to the matching Inter weight family.
// This lets every existing screen keep using fontWeight: '700' / '800' etc.
// without manually wiring fontFamily everywhere — and it works on Android,
// where RN does NOT synthesize bold weights for custom fonts.
//
// The patch is defensive: it only runs when render is writable on the host
// component, and it bails out gracefully if the original render returns
// something that isn't a React element (e.g. null) so we never crash the app
// because of a typography enhancement.
import React from 'react';
import { Text, TextInput, StyleSheet, Platform } from 'react-native';
import { FONTS } from '../theme';

const WEIGHT_FAMILY = {
  '100': FONTS.regular,
  '200': FONTS.regular,
  '300': FONTS.regular,
  '400': FONTS.regular,
  normal: FONTS.regular,
  '500': FONTS.medium,
  '600': FONTS.semibold,
  '700': FONTS.bold,
  bold: FONTS.bold,
  '800': FONTS.extrabold,
  '900': FONTS.extrabold,
};

let patched = false;

function familyForStyle(style) {
  const flat = StyleSheet.flatten(style) || {};
  const weight = flat.fontWeight != null ? String(flat.fontWeight) : '400';
  return WEIGHT_FAMILY[weight] || FONTS.regular;
}

function safeWrap(Component) {
  const original = Component && Component.render;
  if (typeof original !== 'function') return;

  // Verify render is writable; if not (frozen/sealed in some RN builds),
  // skip the patch silently rather than throwing on assignment.
  const descriptor = Object.getOwnPropertyDescriptor(Component, 'render');
  if (descriptor && descriptor.writable === false && !descriptor.set) return;

  try {
    Component.render = function patchedRender(...args) {
      const origin = original.apply(this, args);
      if (!origin || !React.isValidElement(origin)) return origin;
      const family = familyForStyle(origin.props && origin.props.style);
      // Place existing styles between two fontFamily layers so we always win
      // on family selection but never override the caller's color or size.
      return React.cloneElement(origin, {
        style: [{ fontFamily: family }, origin.props.style, { fontFamily: family }],
      });
    };
  } catch {
    // Patch is purely cosmetic — never let a render override break the app.
  }
}

export function applyFontPatch() {
  if (patched) return;
  patched = true;
  // The patch is ONLY needed on Android, where RN doesn't synthesize Inter
  // weights from a single family. On web, react-native-web's Text/TextInput
  // render real DOM elements (<span>/<input>) — React DOM only accepts a
  // plain-object `style` prop, so wrapping the rendered element in an array
  // style crashes with "Indexed property setter is not supported on
  // CSSStyleDeclaration". On iOS, the system synthesizes weights cleanly.
  if (Platform.OS !== 'android') return;
  safeWrap(Text);
  safeWrap(TextInput);
}
