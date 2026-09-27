# Driver Delivery App (Aviate)

## Overview
A React Native / Expo driver app for a company logistics platform. Dispatch (admin) sends optimized multi-stop routes to drivers; the driver app is a pure execution client — no money, no analytics, no decisions. One screen = one action. Runs as a web app in the Replit preview using Expo's web target, and as a native app on iOS/Android via Expo Go.

## Tech Stack
- **Framework:** React Native + Expo SDK 54
- **Typography:** Inter (via `@expo-google-fonts/inter` + `expo-font`); a small `src/utils/fontPatch.js` maps every `fontWeight` (400/500/600/700/800) to the matching Inter family at the `<Text>` / `<TextInput>` render layer so existing styles keep working on Android (which doesn't synthesize bold for custom fonts)
- **Splash:** `expo-splash-screen` with brand-navy background (`#0F2A3D`) and the white Aviate mark, held until fonts are ready
- **Navigation:** React Navigation (bottom tabs + stack for modals)
- **State:** React Context API (Driver, Notifications, Jobs)
- **Maps (web):** MapLibre GL JS + OpenFreeMap vector tiles (3D pitch + bearing)
- **Maps (native):** react-native-maps
- **Routing engine:** OSRM public demo (`router.project-osrm.org`) for road geometry between stops
- **Safe areas:** react-native-safe-area-context for header/tab-bar inset handling
- **Tests:** Jest (jest-expo preset) — see `babel.test.config.js`

## Navigation
Three bottom tabs (custom `AppTabBar` with active pill + safe-area-aware bottom inset):
1. **Routes** — new routes from dispatch + assigned routes in progress
2. **Active** — full-screen execution view: route map, current stop, single state-driven button
3. **History** — completed routes summary (today/week stats: routes, stops, distance, time)

Two modal stack screens (presented from any tab via header buttons):
- **Notifications** — inbox of dispatch alerts; auto-marks as read
- **Profile** — driver identity, vehicle, contact, lifetime stats

## Project Structure
```
App.js                            # Thin root: providers + RootNavigator
index.js                          # Expo registerRootComponent
metro.config.js                   # Web alias for react-native-maps + .local blocklist
jest.config.js                    # Test runner config (uses babel.test.config.js)
babel.test.config.js              # Jest-only babel preset (isolated from Expo Metro)
__tests__/                        # Jest tests (api + routing)
src/
  data/                           # Mock seed data (one module per domain)
    driver.js                     #   single driver profile
    notifications.js              #   inbox items
    routes.js                     #   dispatch routes with stops
    history.js                    #   completed-route history
    index.js                      #   barrel re-export
  services/
    api.js                        # Fake API over seed data ({ data } responses + delay)
    routing.js                    # OSRM road-geometry fetch (graceful fallback to null)
  contexts/
    DriverContext.js              # Driver profile (read-only)
    NotificationsContext.js       # Items + unreadCount + markAllRead/markRead/push
    JobsContext.js                # Routes state + active route + accept/start/advance
    ToastContext.js               # Global slide-down toast (success / info / error variants)
  navigation/
    RootNavigator.js              # NavigationContainer + Stack(Tabs + modals)
  components/
    BarcodeScanModal.js           # Camera scan (native) / manual entry (web) for package barcode confirmation
    AppTabBar.js                  # Custom bottom tab bar — spring icon on focus, press scale, haptic on switch
    ScreenHeader.js               # Tab-screen header (title + bell + avatar)
    ModalHeader.js                # Modal header (back + title + optional right action)
    Avatar.js                     # Image w/ initials fallback
    Loader.js                     # Spinner with optional message
    Skeleton.js                   # Shimmer placeholder + SkeletonCard / SkeletonRow presets
    PressableCard.js              # iOS-feel scale-down on press, optional haptic
    AnimatedProgress.js           # Smoothly tweens width when value changes
    RouteMap.js                   # Cross-platform map (web → MapLibre, native → react-native-maps)
  screens/
    JobsScreen.js                 # Routes list (new + assigned)
    ActiveJobScreen.js            # Map + current stop + state-driven CTA
    EarningsScreen.js             # History/stats screen
    NotificationsScreen.js        # Notifications modal
    ProfileScreen.js              # Driver profile modal
  mocks/
    react-native-maps.js          # Web MapLibre wrapper exporting MapView/Marker/Polyline
  theme/
    index.js                      # COLORS + SPACING + RADII + TYPE design tokens
  hooks/
    useDriverLocation.js          # Cross-platform expo-location watcher (web + native)
  utils/
    format.js                     # formatDuration, formatDistanceKm
    geo.js                        # haversineMeters, bearingDeg, formatMeters, ARRIVAL_RADIUS_M
    haptics.js                    # expo-haptics wrapper (light/medium/heavy/selection/success/warning/error); no-ops on web
```

## Mock Data
All seed data lives under `src/data/` — one module per domain, each exporting a named constant (`driver`, `notifications`, `routes`, `history`). The barrel `src/data/index.js` re-exports everything so consumers do `import { routes } from '../data'`. To swap to a real backend, replace these imports inside `src/services/api.js` (and the contexts) with fetch calls — no UI code needs to change.

## Route Data Model
A route represents an optimized multi-stop assignment from dispatch:
```
{ id, status, assigned_by, total_distance_km, total_duration_min,
  stops: [{ id, type: 'pickup'|'dropoff', address, lat, lng, customer, cargo, notes, completed }],
  current_stop_index }
```
Statuses: `available` → `assigned` → `in_progress` → `completed`.

## Active Screen Flow
- Status `assigned` → primary button: **Start trip**
- Status `in_progress`, current stop is pickup → **Confirm pickup**
- Status `in_progress`, current stop is drop-off → **Confirm delivery · stop N**
- When live location is within `ARRIVAL_RADIUS_M` (30 m) of the current stop, the button text switches to **Arrived — confirm pickup/delivery** and turns green.
- All stops complete → **Route complete**, returns user to Routes tab

## Live GPS Tracking
- `useDriverLocation({ enabled })` wraps `expo-location` and works on web (browser geolocation prompt) and native (`ACCESS_FINE_LOCATION` / `NSLocationWhenInUseUsageDescription`).
- Streaming starts only when a route status is `in_progress`; the hook stops the watcher cleanly on tab change, route completion, or unmount.
- The map renders an animated blue puck at the driver's coordinates. While in nav mode, the camera follows the driver (instead of the next stop) and rotates to a bearing pointing from the driver toward the next stop.
- A live banner over the map shows distance to the next stop ("420 m to Rosebank Mall") and a pulsing dot that indicates the GPS stream is active.
- An **Open in maps** chip on the current-stop card hands off turn-by-turn directions to Apple Maps / Google Maps / Google Maps web.
- If the user denies location or services are off, a tappable warning banner appears with a retry button.

## Maps
- On web, `react-native-maps` is aliased (via `metro.config.js` resolveRequest) to `src/mocks/react-native-maps.js`, which renders MapLibre GL JS with free OpenFreeMap vector tiles, numbered pins (teal pickup / navy drop-off / grey completed), and a polyline that follows actual roads via OSRM. When the route is in-progress the camera tilts to 60° pitch and rotates toward the next stop for a Google-Maps-style navigation feel.
- On native, the real `react-native-maps` is used unchanged.
- If OSRM is unreachable, the map falls back to straight lines between stops.

## Stop Completion Gating (proof-of-delivery)
A driver can **only** mark a stop complete after BOTH:
1. **Geofence check** — they are within `ARRIVAL_RADIUS_M` (30 m) of the stop coordinates, measured by live GPS via `useDriverLocation`.
2. **Barcode scan match** — the scanner reads (or the driver manually enters) a package barcode that exactly matches the stop's `barcode` field from dispatch.

Until both conditions are met the primary footer button is disabled and shows a lock icon with the literal distance to the stop ("Get closer · 1.2 km away") instead of the action label.

`BarcodeScanModal` (`src/components/BarcodeScanModal.js`):
- **Native (iOS / Android)** — opens a full-screen `expo-camera` `CameraView` with the standard Linear / 2D barcode types enabled (`qr, code128, code39, code93, ean13, ean8, upc_a, upc_e, pdf417, itf14, datamatrix, aztec`). A reticle overlays the live feed; on a match it flashes green and auto-confirms after a 450 ms feedback beat. Mismatches flash red, vibrate, and prompt "Scan again". A keypad button in the header opens a manual fallback entry sheet for damaged/missing labels.
- **Web (preview / fallback)** — browsers don't have reliable cross-vendor barcode APIs, so the modal renders a centered sheet with the **expected barcode visible** and a text input for the driver to type/paste it. This is also what runs in the Replit preview pane.
- **Camera permission** is requested in-modal on first use; the explanation strings live in `app.json` under `NSCameraUsageDescription` (iOS) and the `expo-camera` plugin's `cameraPermission` (Android). The Android `CAMERA` permission is also declared.

The driver-facing **Active screen** also surfaces the gating state explicitly: a status box ("Drive within 30 m of the stop to unlock scanning · 1.2 km away" or "You are at the stop — ready to scan the package barcode."), the expected barcode in the current-stop card, and on web a small "Demo: simulate arrival at this stop" pill so the gated flow is testable in the browser preview without real GPS at the package address. The simulate flag resets after each successful scan so it doesn't persist across stops, and it is **not rendered on native** — real drivers always use real GPS.

## UX Polish (Apple-style)
- **Haptics** via `expo-haptics`: tab switches (selection), accept route (medium → success), pull-to-refresh (light), confirm pickup/delivery (medium → success), arrival within 30 m (warning), errors (error). Web no-ops gracefully.
- **Skeleton loaders** on the Routes and History first-load instead of spinners — animated opacity placeholder cards (Apple Mail / News pattern).
- **Pull-to-refresh** on Routes and History with teal tint.
- **Animated progress bars** (`AnimatedProgress`) tween width changes over 600 ms so completing a stop feels smooth instead of snapping.
- **Toast** (`ToastContext`) slides down from the top safe area for confirmations: "Pickup confirmed", "Stop N delivered", "Trip started — drive safe", "Route complete — nice work", "Arriving at …", and error states.
- **PressableCard** scale-down spring on press for assigned-route cards (the iOS list-item feel).
- **Tab bar** uses Pressable with a spring scale-down on press and a focus-spring that scales the focused icon into place.
- **Staggered fade-in** for cards on Routes and History so the screen feels alive on entry.
- All `Animated` views guard `useNativeDriver` on `Platform.OS !== 'web'` so the web bundle never warns about the missing native module.

## Theming & Layout
- Light header that blends into the page background; thin hairline border instead of a solid bar
- Custom bottom tab bar with active-pill indicator and shadow; respects iPhone home-indicator safe area
- All headers/tabs scale font and button sizes responsively at the 360 px and 420 px breakpoints
- Touch targets ≥38 px with `hitSlop` for forgiving taps; accessibility labels on all icon buttons

## Running
- **Workflow:** "Start application" runs `npm run web` (Expo web on port 5000).
- **Tests:** `npm test` (16 tests across api + routing).
- For native: scan the QR from Expo CLI with Expo Go.

## Building Android APK
The project is configured for EAS Build. `eas.json` defines three profiles:
- `development` — APK with dev client (for debugging)
- `preview` — internal-distribution APK (recommended for sharing test builds)
- `production` — Play Store AAB (with auto-incrementing version)

Steps to produce an APK:
1. Sign in to Expo: `npx eas login`
2. Initialize the project (first time only): `npx eas project:init`
3. Build APK: `npx eas build --profile preview --platform android`

The build runs in Expo's cloud — no Android SDK / Gradle / JDK needed locally. When it finishes, EAS gives you a download URL for the APK.

### Native crash safety checklist (verified)
- `react-native-worklets` is installed at the version expected by Expo SDK 54 (required peer of `react-native-reanimated`; without it the APK crashes on launch).
- All Expo SDK 54 package versions are aligned (`expo-doctor` passes 17/17 checks).
- Camera and location permissions + usage strings are declared in `app.json` for both iOS and Android.
- `expo-haptics` and `expo-camera` are guarded with platform/try-require checks so missing native modules never crash the bundle.

### Optional: Google Maps on Android
The native map (`react-native-maps`) renders without an API key on iOS (Apple Maps) and on Android (default provider, basic tiles). If you want Google Maps tiles on Android, add to `app.json` → `expo.android.config.googleMaps.apiKey` and store the key in EAS Secrets.
