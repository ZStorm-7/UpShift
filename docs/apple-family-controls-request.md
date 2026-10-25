# Apple Family Controls entitlement: request text

Apple does not give this entitlement automatically. **You** (the Account Holder of the Apple
Developer account) must submit the request; nobody else can, and no tool can do it for you.

## Steps
1. Sign in at developer.apple.com as the Account Holder.
2. Open: **Account > Request an entitlement > Family Controls (Distribution)**. (Search the
   Contact Us page for "Family Controls" if the menu has moved.)
3. Submit **one request per bundle id**. You need four, because the app and each extension is a separate target:
   * `com.upshift.app` (use your real bundle id from `app.config.js`)
   * `<bundle id>.ActivityMonitor`
   * `<bundle id>.ShieldAction`
   * `<bundle id>.ShieldConfiguration`
4. Paste the text below. Approval usually takes days to a few weeks. Until then the feature
   only runs from Xcode on your own devices.
5. After approval, in the Developer portal enable **Family Controls** on each of the four App IDs, regenerate
   the provisioning profiles, then build with `APPLE_TEAM_ID=<your team id> eas build --platform ios`.

## Text to paste

**App name:** UpShift

**What the app does:** UpShift is a fitness and wellbeing app (workouts, nutrition and habit tracking).
It includes an optional "mindful breaks" feature.

**How you use Family Controls:** The person using the phone chooses, with Apple's own app picker, which of their own
apps get a pause. After the time they choose (30 minutes by default) in those apps, the system shield appears and UpShift sends a
notification inviting a 15-second breathing exercise. Optional extras the person turns on themselves are bedtime
hours and a strict mode that closes the chosen apps for 15, 30 or 60 minutes.

**Why it is needed:** DeviceActivityMonitor counts time in the apps the person selected, and ManagedSettings shields them
for the pause. There is no other way to do this across apps on iOS.

**Data handling:** UpShift never learns which apps were chosen (it only receives Apple's opaque tokens), never
reads usage, and nothing about app usage is sent to our servers or any third party. The feature is
opt-in, can be switched off at any time in the app, and the authorization can be revoked in iOS Settings > Screen Time.

**Who it is for:** adults managing their own device (individual authorization). It is not a parental-control or monitoring tool and
no one can enable it on another person's device.

**Contact:** Ridu.1029384756@gmail.com
