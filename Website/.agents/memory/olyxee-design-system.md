---
name: Olyxee design system
description: The app follows the "Olyxee" visual doctrine — how tokens live in index.css and the rules that must hold when styling.
---

# Olyxee design system

The UI follows the **Olyxee** doctrine (Apple-level discipline, own identity). The token
layer lives in `src/index.css` (`@theme` + `:root`): neutral palette (`--color-neutral-0..900`,
base #F8F9FA app bg / #FFFFFF surfaces / #E9ECEF borders), semantic colors, shadow scale
(`--shadow-xs..--shadow-overlay`), radius scale (`--radius-xs..--radius-full`), 4px spacing
scale, and motion tokens (`--duration-*`, `--ease-standard/enter/exit/emphasised`).

Non-obvious rules to keep:
- **Motion must be restrained, never elastic.** No spring/overshoot on buttons or serious
  actions — button press is a small `scale(0.98)`. The old `--ease-ios`, `--ease-ios-out`,
  `--ease-ios-bounce` names are kept **as aliases** pointing at Olyxee curves, so don't
  reintroduce bounce by redefining them.
- **Surface hierarchy:** app background is neutral-50 (`bg-[#f8f9fa]` on the Layout/DriverLayout
  root), working surfaces/cards are white — that contrast is what makes cards read as elevated.
  Don't set the shell back to white.
- **Teal `#008080` is the brand accent** (Olyxee "active selection"), kept through the restyle.
- Components use shared classes (`.apple-card`, `.apple-btn*`, `.apple-input`, `.stat-card`,
  `.ios-seg`, `.list-row`, etc.) — restyle via those tokens, not per-component overrides.

**Why:** the user supplied the full Olyxee spec and asked to apply it; the prior look was an
Apple-clone with bouncy iOS easings the doctrine explicitly forbids.
**How to apply:** when adding UI, pull from the neutral/semantic/shadow/radius/motion tokens
in index.css and reuse the shared classes; keep sentence case and ≤3 font weights per screen.

## Command Center aesthetic (do not go dark)
Keep the Command Center light and clean on the neutral-50 shell with white cards. Color comes from small accents (severity-colored left rail on decision cards, colored count tile, severity pills, colored section dots). Avoid the dark "mission-control / AI console" look: no dark gradient deck, grid texture, monospace readouts, or live clock. **Why:** the user explicitly rejected the dark console style as looking like generic AI UI and asked for something unique, clean, minimal, with color.
