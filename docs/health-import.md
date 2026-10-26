# Health import (Apple Health and Health Connect)

**Status: groundwork only, nothing is connected yet, and none of it has run on a device.**

What exists and is tested (`npm test`):

- `services/health/health.ts`: the shape of a health day, cleaning of raw numbers, and `planMerge`, which decides what to write. Anything the person logged by hand always wins; imported sleep, steps and weight only fill gaps.
- `services/health/provider.ts`: a registry. A device build registers a provider; with none registered, the app shows no health UI.

What is still missing, and needs a real device build:

1. **A reader per platform.** iOS: HealthKit via a config plugin / native module (read-only: steps, sleep analysis, body mass). Android: Health Connect (`androidx.health.connect:connect-client`, read-only: `Steps`, `SleepSession`, `Weight`). Each must return `ProviderResult` from `provider.ts` and never throw.
2. **Permissions text.** `NSHealthShareUsageDescription` on iOS and the Health Connect permission declarations plus a privacy-policy activity on Android. Google Play requires the health-permissions declaration form.
3. **A Settings row** that calls `getHealthProvider()?.read(14)`, runs each day through `cleanHealthDay` and `planMerge`, and writes the result to the day document and weight log.
4. **Privacy policy**: add a paragraph before enabling (data is read on the device, merged into the person's own documents, never sent anywhere else).

Why not finish it here: HealthKit and Health Connect cannot be exercised on the emulators used for testing, and shipping an unverifiable native integration risks breaking the Android build.
