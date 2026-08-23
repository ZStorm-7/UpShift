# Shipping UpShift to the Google Play Store

Everything below runs from `C:\Users\dhanu\Ascend` in PowerShell unless stated
otherwise.

---

## First: how this actually works

Right now you run `npx expo start` and open the app in Expo Go or a browser.
That is **not** an app — it's a development server streaming your JavaScript to
a viewer app. Nothing is installed; close the server and it's gone.

A real Android app is a **compiled binary** containing your JavaScript, a native
Android shell, and every native module you use (`expo-image-picker` has real
Java/Kotlin code inside it). Producing that binary is called a **build**, and it
needs the Android SDK, a JDK, and Gradle — roughly 10–15 GB of tooling.

You don't have to install any of that. **EAS Build** compiles it on Expo's
servers and hands you a file. That's the whole reason we're using it.

Two output formats matter:

| Format | What it is | Used for |
|---|---|---|
| **APK** | Directly installable on a phone | Testing, sharing with friends |
| **AAB** | Android App Bundle — Google splits it per-device | **Required** for Play Store |

You cannot install an AAB on a phone directly, and you cannot upload an APK to
the Play Store. You need both, which is why `eas.json` defines both.

---

## Part 1 — Your first build (~30 minutes, free)

### 1. Make an Expo account

Go to <https://expo.dev> and sign up. Free.

### 2. Install the EAS CLI and log in

```powershell
npm install -g eas-cli
eas login
```

### 3. Link the project

```powershell
eas init
```

This creates a project on Expo's servers and writes an `extra.eas.projectId`
into your `app.json`. Let it — that ID is how EAS knows which project a build
belongs to. Commit the change.

### 4. Build a test APK

```powershell
eas build --platform android --profile preview
```

The `preview` profile in `eas.json` sets `"buildType": "apk"` — that's what
makes this installable rather than an AAB.

First time, EAS asks:

> *Generate a new Android Keystore?* → **Yes**

**Understand what just happened, because it matters permanently.** A keystore
is a cryptographic key that signs your app. Android uses the signature to prove
that an update came from the same developer as the original install. If you
lose it and haven't enrolled in Play App Signing, **you can never update your
app again** — you'd have to publish a new listing under a new package name and
lose all your users. EAS stores it for you; you can back it up with
`eas credentials`.

The build takes 10–20 minutes on the free tier (your job waits in a shared
queue). You'll get a URL to download the `.apk`.

### 5. Install it on your phone

1. Open the build URL on your Android phone (or email yourself the APK)
2. Tap the downloaded file
3. Android will warn about "unknown sources" — allow it for your browser
4. Install, open

**This is now a real, standalone app.** Turn off your PC — it still works.

### 6. Test properly before going further

- Sign up as a brand-new user (verifies the quest-gating fix)
- Complete onboarding in a non-English language
- Log food, water, sleep, a workout
- Check that XP persists after force-closing the app
- Open the Leaderboard (needs `firestore.rules` published — see below)
- Log out and back in

> **Publish your Firestore rules first** or the leaderboard will fail:
> Firebase Console → Firestore Database → Rules → paste `firestore.rules` → Publish.

---

## Part 2 — The Play Store

### The part nobody warns you about

Google requires personal developer accounts created after **November 13, 2023**
to run a closed test with **at least 12 testers opted in continuously for 14
days** before you can publish publicly. There is no way around it — Production
stays locked until you meet it.

Plan for that. Twelve real people, each with a Google account, each staying
opted in for two straight weeks. If someone opts out midway, the clock can
reset. **Start recruiting testers on day one**, not after everything else.

### 1. Create the developer account — $25, one time

<https://play.google.com/console> → pay the one-time $25 registration fee.
Identity verification takes anywhere from a day to a couple of weeks.

### 2. Host your privacy policy

Google requires a **public URL** — a file on your computer won't do. Your app
collects email and health data, so this is mandatory, not optional.

Free options: publish `PRIVACY_POLICY.md` as a GitHub Pages site, or paste it
into a public GitHub Gist. Either gives you a URL.

Fill in `[YOUR EMAIL]` first — placeholders get listings rejected.

### 3. Build the production AAB

```powershell
eas build --platform android --profile production
```

The `production` profile outputs an app-bundle and auto-increments your version
code. Android requires every upload to have a **higher `versionCode` than the
last** — `autoIncrement: true` handles that so you can't accidentally upload a
build Google refuses.

### 4. Create the app in Play Console

**App name:** UpShift · **Language:** English · **Type:** App · **Free**

### 5. Fill out the Data Safety form — carefully

This is the section most first-timers get wrong, and lying here (even by
accident) is a policy violation. Based on what UpShift actually does:

| Question | Answer |
|---|---|
| Does your app collect or share user data? | **Yes** |
| Is data encrypted in transit? | **Yes** (Firebase uses HTTPS) |
| Can users request data deletion? | **Yes** (via the email in your policy) |

Data types to declare:

- **Personal info → Email address** — collected, for account management
- **Personal info → Name** — collected, for app functionality
- **Health and fitness → Health info** — collected, for app functionality
  *(your weight, sleep and food logs count as health data)*
- **Health and fitness → Fitness info** — collected, for app functionality

Mark everything as **collected but not shared**, and **not used for
advertising**. That's accurate — you have no ad SDK and no analytics.

### 6. Content rating questionnaire

Answer honestly. A fitness tracker with no ads, no purchases, no user-generated
content and no violence typically lands at **Everyone / PEGI 3**.

One question deserves care: the leaderboard **does** show other users' names.
That's "user-generated content" in a limited sense — declare it. It won't hurt
your rating meaningfully, and under-declaring can get you pulled later.

### 7. Set up closed testing

**Testing → Closed testing → Create track** → upload your AAB → add your 12+
testers by their Gmail addresses → share the opt-in link.

Each tester must open the link, tap "Become a tester," and **install the app**.
Make sure they don't uninstall or opt out — the 14-day clock wants continuous
enrolment.

### 8. Apply for production

After 14 days with 12+ continuous testers, Play Console shows an **Apply for
production** button. Google reviews the app — typically a few days, sometimes
longer for a first submission.

---

## Fixing problems

**Build fails on EAS** — the log link tells you the failing step. Most common
for this project: a native module version mismatched to your Expo SDK. Fix with
`npx expo install --check`, which realigns dependencies to SDK 57.

**App installs but crashes instantly** — almost always a bundling issue that
Expo Go hid. Get the real error:

```powershell
adb logcat *:E
```

(needs Android platform-tools, or use `eas build:run` for a device log)

**Leaderboard is empty on a real device** — `firestore.rules` isn't published.
That's a console action, separate from your code.

**Google rejects the listing** — read the exact policy they cite. For health
apps the usual culprits are an incomplete Data Safety form or an unreachable
privacy policy URL.

---

## Cost summary

| Item | Cost |
|---|---|
| EAS Build (free tier) | $0 — limited concurrent builds, queue waits |
| Firebase Spark plan | $0 |
| Cloudinary (unused) | $0 |
| USDA API | $0 |
| **Google Play registration** | **$25 once** |

Total to publish: **$25**.
