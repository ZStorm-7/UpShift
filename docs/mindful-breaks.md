# Mindful breaks

After N minutes of use (default **30**) in the apps the user chooses, UpShift
brings up a mandatory **15-second breathing break**: an eye closes, the user
breathes with an orb and haptic cues, the eye opens, and they choose **Stay in
UpShift** or **Exit** (back to the app they were in). It repeats every N minutes.
Inspired by ClearSpace, which gates apps behind a notification and a breathing screen.

## What works where

| | Android | iPhone | Expo Go / web |
|---|---|---|---|
| Break inside UpShift | yes | yes | yes |
| Break over **other** apps | yes, UpShift jumps to the front | yes, Apple shields the apps and sends a notification | no |
| "Exit" returns to the other app | yes (resumes where they were) | **no**: iOS cannot switch apps, so the user is told to switch back | n/a |
| Choose apps | by name, in UpShift | Apple's own picker (UpShift never learns the names) | n/a |
| Schedule (days and hours, overnight ok) | yes | yes (split into per-day windows) | in-app only |
| Strict mode (close apps for 15/30/60 min) | yes | yes (Apple blocks them, lifts at the end) | n/a |
| Emergency pass (2 a day, 10 min pause) | yes | yes (breaks resume after the pause) | yes |
| Daily limit | yes | **no** (Apple's extension runs without our code, so it can't count breaks) | in-app only |
| Smart timing (night, rapid switching) | yes | **no** (same reason) | night only |
| Needs | Usage access + Display over other apps | Screen Time authorization + Apple's Family Controls entitlement | nothing |

Other-app breaks need a **development or production build**, not Expo Go.

## Files

* `screens/BreakScreen.tsx`: the exercise (eye + orb animation, haptics, Stay/Exit)
* `screens/BreaksSettingsScreen.tsx`: interval, apps, what to pause, permissions
* `services/breaks/timeline.ts`: the 15 s script as data (tested)
* `services/breaks/usageTracker.ts`: decides when a break is due (tested)
* `context/BreakContext.tsx`: settings, in-app timer, hand-off from native
* `services/breaks/native.ts`: one interface over Android and iOS
* `modules/upshift-breaks/`: Android module (foreground service, boot receiver)
* `app.config.js`: adds the iOS native extensions only when `APPLE_TEAM_ID` is set

The Kotlin `UsageTracker` is a port of the TypeScript one. Both were run on the
same four scenarios and gave identical break times; change them together.

## Building

### Android
```
npx expo prebuild --platform android      # or just: eas build -p android --profile development
```
The local module in `modules/` is autolinked. On the phone:
1. Settings > Mindful breaks: turn it on, tick some apps.
2. **Usage access**: Allow > read the disclosure > Continue > enable UpShift in the system list.
3. **Display over other apps**: Allow > enable UpShift.
4. On phones that kill background apps (Xiaomi, Samsung, OnePlus, Huawei), also
   allow "Keep running in the background".
5. Set a short interval to test (the minimum is 5 minutes). Use a chosen app until the
   break appears. Try pressing Home mid-exercise: it restarts when you return.

### iPhone
1. Get Apple's approval for the **Family Controls (Distribution)** capability. You
   need it for the app and for each of the three extensions (ActivityMonitor,
   ShieldAction, ShieldConfiguration). Until then it only runs from Xcode.
2. `APPLE_TEAM_ID=YOURTEAMID eas build --platform ios --profile development`
3. Settings > Mindful breaks > Screen Time access > Allow > Choose apps.

## Store requirements (not optional)

**Google Play**
* Foreground service type **specialUse**: the Play Console asks you to declare it and
  explain the use. Text: "Checks which app is in the foreground so a short breathing
  break can start after the time the user chose in the apps they selected."
* **Usage access** and **Display over other apps** are sensitive: use the in-app
  disclosure that is already shown before the system screen, and describe the feature
  in the listing. Play reviews apps that use these.
* No Accessibility service and no `QUERY_ALL_PACKAGES` are used on purpose.
* Update the Data safety form: app usage data is processed on-device only.

**Apple**
* The Family Controls entitlement request asks what the app does and why. Say it is a
  wellbeing app that pauses chosen apps for a short breathing exercise after a
  user-set time.
* Add the Screen Time usage description to the App Store review notes.

## Limits you should know about

* **Android 14/15** restrict starting activities and foreground services from the
  background. Granting "Display over other apps" is what allows the break to come to
  the front; without it the app falls back to a notification the user taps (not a
  hard stop).
* A phone that force-stops UpShift stops the monitor until the app is opened again.
* On iPhone the break is a shield plus a notification, not an instant takeover, and
  Apple's API reports usage in whole-minute thresholds.
* Pausing the "quest and streak countdown" only freezes the on-screen readout while
  the break is showing. The day and quest cycle are wall-clock based, so a break
  never changes a streak.
* The Workout screen has no live timers today, so "workout and rest timers" has
  nothing to pause yet. When a timer is added, gate it with `useBreakPause('workout')`.
* The Android and iOS native code has been type-checked but **not run on a device**.
  Test on at least one Pixel, one Samsung and one iPhone before releasing.


## Features added in the second round

* **Breathing styles** (all exactly 15 s, never longer): calm 5-1-6, physiological sigh,
  box 3-3-3-3, long exhale. Each has a "good for" line in settings and a **Try it** button.
  Defined as data in `services/breaks/timeline.ts`; tests assert each sums to 15,000 ms,
  opens and closes with the eye, and never jumps.
* **Soft sound** that swells with the breath. Generated from the same timeline by
  `npm run make:breath-sounds` (plain sine partials, no licensed audio). Off = haptics only.
  It follows the phone's silent switch.
* **Intention step**: after the breathing, "What brings you to {app}?" with four answers.
  Only counts are stored (`users/{uid}/breakDays`), never words.
* **Emergency pass**: press and hold 3 s, 2 a day, pauses breaks and strict mode for 10 min.
  Screen-reader users get a plain "activate" action instead of a hold.
* **Weekly insights** screen: hero number, streak, exit rate, a 7-day bar chart with a
  table view, and why you opened apps.
* **Policy engine** (`services/breaks/policy.ts`, mirrored in `BreakPolicy.kt`/`UsageTracker.kt`).

## Keeping Kotlin and TypeScript identical

The background service can't run JavaScript, so the rules exist twice. The parity tool runs
400 randomized scenarios through both and the outputs must match exactly:

```
D=$(mktemp -d)
node --import ./tests/register.mjs modules/upshift-breaks/parity/ts-run.ts $D 400
kotlinc -cp kotlin-stdlib.jar -d $D/out \
  modules/upshift-breaks/android/src/main/java/expo/modules/upshiftbreaks/{UsageTracker,BreakPolicy}.kt \
  modules/upshift-breaks/parity/Main.kt
java -cp $D/out:kotlin-stdlib.jar MainKt $D/scenarios.txt $D/kotlin.txt
diff $D/expected.txt $D/kotlin.txt && echo identical
```
It was run before this commit (400/400 identical) and was shown to catch deliberately
injected bugs. Run it again whenever either side changes.


## Features added in the third round

* **Bedtime wind-down**: from bedtime to the morning unlock your chosen apps stay closed
  (same screen as strict mode, with the time they reopen), and any break uses the long
  exhale. Daily, overnight windows work. Android and iPhone.
* **Never interrupt**: a break waits for a phone call, navigation or car mode, and
  workouts. They beat everything, including strict mode and the wind-down. On Android
  calls use `AudioManager.mode`, car mode uses `UiModeManager`, and navigation/fitness
  apps are matched by package name (see `NAVIGATION_APPS` / `WORKOUT_APPS` in
  `BreakMonitorService.kt`; extend as needed). Inside UpShift, the Workout screen is
  exempt. iPhone cannot see calls or other apps, so only the in-app workout exception works there.
* **Emergency pass toggle**: turn it off for a truly strict mode.
* **Mood after a break**: one optional tap, stored as a count, read by the coach and shown
  as an average on the insights screen.
* **Reflection**: one short original line a day (14 per language, `data/reflections.ts`).
* **Rewards**: 10 XP for each of your first 3 breaks a day (30 max) via the existing XP
  transaction, and avatar frames at a 3, 7 and 30 day break streak (your longest streak,
  so a missed day never takes one away). Frames show on your own Dashboard avatar.
  Themes were not built.
* **Coach**: "Break insights" reads your tally (including the busiest hour of the day) and can
  suggest a breathing style; you confirm before it changes.
* **Friends**: break streaks appear on friend cards, and a challenge can now be "most mindful
  breaks this week" as well as workouts.
* **Android home-screen widget** (`BreakWidgetProvider.kt`): time to the next break, or why
  there isn't one (strict, paused, outside your schedule, done for today, off). Its logic is
  in the parity check (196,188 samples identical). **There is no iPhone widget**: Expo's
  `expo-widgets` is iOS-only and needs a Mac build, so it could not be built or tested here.
