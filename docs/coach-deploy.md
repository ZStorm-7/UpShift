# Deploying the AI coach backend

The coach no longer calls Gemini from the app. It calls a Cloud Function that
holds the API key, checks consent, enforces limits and runs the safety screen.
**Nothing works until this is deployed.**

1. **Upgrade the Firebase project to the Blaze (pay-as-you-go) plan.** Cloud
   Functions and Secret Manager are not available on the free Spark plan.
   Set a budget alert in Google Cloud so costs can't surprise you.
2. **Rotate the Gemini key.** The old key was pasted into a chat and was used
   in a development build, so treat it as exposed. Create a new key in Google
   AI Studio and delete the old one.
3. Store the secrets (never in the repo or `.env`):
   ```
   firebase functions:secrets:set GEMINI_API_KEY
   firebase functions:secrets:set REVENUECAT_SECRET_KEY   # a *secret* (sk_...) API key from RevenueCat
   firebase functions:secrets:set CLOUDINARY_API_KEY      # Cloudinary dashboard > API Keys
   firebase functions:secrets:set CLOUDINARY_API_SECRET
   ```
4. Deploy functions, the new Firestore rules and the index the account-deletion
   cleanup needs:
   ```
   npm --prefix functions install
   firebase deploy --only functions,firestore:rules,firestore:indexes
   ```
   **Deploy the functions before (or together with) the rules.** The new rules
   stop the app from writing `leaderboard/{uid}` directly, so an app build that
   still calls the old code would be refused.
4b. Turn on automatic deletion of old chats and feedback (one time):
   ```
   gcloud firestore fields ttls update expireAt --collection-group=coachMessages --enable-ttl
   gcloud firestore fields ttls update expireAt --collection-group=coachFeedback --enable-ttl
   ```
4c. In the Cloudinary console, **disable the old unsigned upload preset**
   (`u4zelzyn`). It is in older app builds, and until it is off anyone can still
   upload to your account with it.
5. In the Google Cloud console, restrict the new Gemini key to the Generative
   Language API and set a daily quota on it as a second line of defence.
6. Remove `EXPO_PUBLIC_GEMINI_API_KEY` from any local `.env` and EAS secrets.

## How limits work

* Free: 5 chat messages and 2 tool uses per rolling 24 hours. Premium: 50 and 15.
  Change them in `functions/src/config.ts` (the app displays whatever the server reports).
* Premium is verified server-side with RevenueCat. Users on the in-app Firestore
  trial count as free for the coach.
* Abuse controls: 8 requests/minute, one in-flight call per user, temporary
  block after repeated violations, payload and image size caps.
* Quota state lives in `coachUsage/{uid}`, which clients can read but never write.

## Tests

```
npm test            # client helpers + functions (safety, quota, validation)
```

## Other limits worth knowing

* **Leaderboard scores** are written only by the `publishScore` function, which
  caps growth to 1,000 XP/day of allowance (banked up to 3 days). Change
  `DAILY_XP_ALLOWANCE` in `functions/src/ratelimit.ts` if real players legitimately
  earn more. This bounds cheating; it cannot prove a score was earned, because the
  game logic runs in the app.
* **Account deletion** (`deleteAccount`) needs a login under 5 minutes old; the
  app asks for the password first.
* **Avatar uploads** are signed per user (`signAvatarUpload`), limited to 10 a hour.
* Firebase **App Check** is not enabled: the JavaScript Firebase SDK that this app
  uses has no attestation provider for iOS or Android. Enabling it means moving
  the app to React Native Firebase.
