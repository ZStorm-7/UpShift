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
   ```
4. Deploy functions and the new Firestore rules:
   ```
   npm --prefix functions install
   firebase deploy --only functions,firestore:rules
   ```
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
