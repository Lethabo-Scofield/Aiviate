---
name: Legacy Expo navigation
description: An Expo SDK compatibility quirk encountered when restoring the imported driver app.
---

Switching an Expo artifact's `main` to a legacy React Navigation entrypoint does not necessarily bypass the Expo Router compatibility check when Router is still installed. Metro can reject the bundle despite not mounting Router screens. The compatibility override permits this existing navigator to run in Preview, but it is not proof that every native feature works.

**Why:** The imported driver app uses React Navigation, while the generated artifact ships with Expo Router. A correct custom entrypoint still hit the SDK's navigation check until it was explicitly disabled. A working web Preview alone does not verify the native build.

**How to apply:** When maintaining or upgrading this mobile artifact, check the actual bundled navigator and validate native features before claiming readiness for store publication. Do not replace the imported driver screens with scaffold Router placeholders just to satisfy the check.