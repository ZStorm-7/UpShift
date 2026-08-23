# UpShift animation system — setup

**Read this first: the animation files will not run until you do step 1 and
step 3.** They import Reanimated and SVG, neither of which is currently in your
`package.json`. Until you install and rebuild, the app will fail to bundle with
`Unable to resolve "react-native-reanimated"`.

That is expected, not a mistake. Everything else in the app — the bug fixes,
the redesign — is unaffected and runs today.

---

## Step 1 — install the dependencies

```powershell
cd C:\Users\dhanu\Ascend
npx expo install react-native-reanimated react-native-worklets react-native-svg
```

Use `npx expo install`, not `npm install`. It picks the versions that match
your Expo SDK; plain npm will happily install a Reanimated built for a
different React Native and you'll spend an evening on a native crash with no
useful stack trace.

**Why `react-native-worklets` is separate.** As of Reanimated 4 the worklets
runtime was split into its own package, and the Babel plugin moved with it.
Installing Reanimated alone gets you an error at bundle time about a missing
plugin.

---

## Step 2 — check the Babel config

`babel-preset-expo` has included the worklets plugin automatically since SDK 50,
and you have no `babel.config.js`, which means you're on the default preset and
there is nothing to do.

If you ever add a `babel.config.js`, the plugin must be listed **last**:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'], // must be last
  };
};
```

If you hit `[Reanimated] Seems like you are using a Babel plugin
react-native-reanimated/plugin`, that's the old plugin name — use
`react-native-worklets/plugin`.

---

## Step 3 — rebuild. Your current APK cannot run this.

Reanimated and SVG contain **native** code. The APK you already installed was
compiled without them, and no amount of reloading JavaScript will add them —
you need a new binary:

```powershell
eas build --platform android --profile preview
```

Another 10–20 minute build, then install the new APK over the old one. Your
account and data are untouched.

If the build fails on a version mismatch, run `npx expo install --check` first
— it realigns every dependency to your SDK.

---

## What was added

| File | What it is |
|---|---|
| `animation/motion.ts` | Durations, easing curves, spring configs. The motion equivalent of `theme/tokens.ts`. |
| `animation/transitions.ts` | Cinematic screen interpolators for `@react-navigation/stack`. |
| `components/anim.tsx` | Reusable primitives: `ScreenTransition`, `PressableScale`, `CountUp`, `PulseRing`, `SlideInRow`, `Shimmer`, `AnimatedMeter`. |
| `components/GearSpinner.tsx` | The revving-gears loader (SVG). |
| `components/CaloriePunch.tsx` | Ring punch + floating "+XP" on logging food. |
| `components/StreakSpark.tsx` | Check-in button with press physics and a particle burst. |
| `screens/WorkoutSummaryScreen.tsx` | The payoff screen a finished workout now lands on. |

---

## Using them

### The loader

```tsx
import GearSpinner from '../components/GearSpinner';

if (loading) {
  return (
    <Screen style={{ justifyContent: 'center', alignItems: 'center' }}>
      <GearSpinner size={104} label="Loading" />
    </Screen>
  );
}
```

Drop this in wherever an `<ActivityIndicator>` currently sits — Dashboard,
Nutrition, History, Leaderboard all have one.

### The calorie punch

It's imperative, because the animation fires on an *event* (you logged a thing),
not on a state change:

```tsx
const punchRef = useRef<CaloriePunchHandle | null>(null);

<CaloriePunch
  progress={totalCalories / CALORIE_GOAL}
  value={`${Math.max(0, CALORIE_GOAL - totalCalories)}`}
  label="left"
  onReady={h => { punchRef.current = h; }}
/>

// then, after a successful log:
punchRef.current?.punch(25);   // 25 = XP earned, omit for no floating label
```

### The streak button

```tsx
<StreakSpark
  streak={liveStreak(streak, getQuestCycleKey())}
  label="day streak"
  done={streak.lastCompletedCycleKey === getQuestCycleKey()}
  onCheckIn={handleCheckIn}
/>
```

### Screen transitions

Two options, and they are not equivalent.

**Option A — content-only, works with your current navigator.** One line, no
new dependency:

```tsx
import { ScreenTransition } from '../components/anim';

return (
  <ScreenTransition variant="reveal">
    <Screen scroll>{/* ... */}</Screen>
  </ScreenTransition>
);
```

**Option B — the real thing.** The full effect (the outgoing screen scaling
back, the scrim) needs the JS stack, because a native stack hands its
transition to the platform and exposes no interpolator:

```powershell
npx expo install @react-navigation/stack react-native-gesture-handler
```

```tsx
import { createStackNavigator } from '@react-navigation/stack';
import { cinematicScreenOptions, revealScreenOptions } from './animation/transitions';

const Stack = createStackNavigator();

<Stack.Navigator screenOptions={cinematicScreenOptions}>
  {/* ... */}
  <Stack.Screen
    name="WorkoutSummary"
    component={WorkoutSummaryScreen}
    options={revealScreenOptions}
  />
</Stack.Navigator>
```

Gesture Handler also needs `import 'react-native-gesture-handler';` as the very
first line of `index.ts`.

Option A costs nothing and gets you most of the feel. Option B is a heavier JS
stack in exchange for full control. Start with A.

---

## One behaviour change worth knowing

Finishing a workout now navigates to `WorkoutSummary` instead of showing the
inline completion card. It uses `replace`, not `navigate`, so backing out of the
summary returns you to the Dashboard rather than to a finished workout you could
"complete" a second time.

The navigation happens **after** the Firestore writes settle, so the
celebration can't appear for a workout that failed to save.

---

## Things I'd watch for on the first run

- **Nothing animates, no error.** Almost always the Babel plugin — restart the
  bundler with `npx expo start -c` to clear the transform cache.
- **`Cannot read property 'value' of undefined`.** A shared value used before
  its `useSharedValue` ran, usually from moving a hook below an early return.
- **The gears look chunky at small sizes.** `GearSpinner` generates its teeth
  from the size you pass; below about 64px the teeth get coarse. Pass a larger
  `size` and scale the container instead.
- **A loop keeps running after you leave a screen.** Every infinite animation
  here is cancelled in a cleanup function. If you add one, cancel it — an
  uncancelled `withRepeat(..., -1)` outlives its component and runs until the
  app closes.
