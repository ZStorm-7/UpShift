# UpShift

UpShift is a gamified fitness and nutrition app designed to make building
healthier habits more engaging — workouts, meals, sleep and weight tracked
in one place, with XP, ranks, achievements, streaks and a leaderboard layered
on top.

## Features

- Personalized workout plans that progress with you (beginner → pro)
- Workout tracking with a lightweight muscle-recovery view
- Nutrition tracking against the USDA food database, with barcode scanning,
  AI-assisted meal description, and custom/combo meals
- Sleep tracking, including a bedtime wind-down reminder
- XP, levels, ranks, streaks (with streak freezes), and a separate
  achievements/trophy layer
- Daily quests, auto-verified against your actual logged data where possible
- Friends, a global leaderboard, and in-app messaging
- Public profiles
- RevenueCat-powered premium access with a no-card 7-day trial

## Built With

- React Native + Expo (SDK 57)
- TypeScript
- Firebase Authentication + Cloud Firestore
- Firebase Cloud Functions
- RevenueCat (subscriptions)
- Google Gemini API (AI meal description / photo recognition)
- Cloudinary (profile photo uploads)

## Running UpShift

### Requirements

- Node.js
- npm
- Expo Go (for a quick preview) or an Expo development build (for real
  in-app purchases and other native-only features)
- iOS or Android device, or a simulator/emulator

### Installation

1. Clone the repository

2. Enter the project
   
3. Install dependencies

4. 
4. Create your environment configuration

Copy `.env.example` to `.env` and fill in your own development API keys
(see the comments in `.env.example` for where to get each one — Gemini,
Google Sign-In, USDA FoodData Central).

5. Start Expo


6. Scan the QR code with Expo Go, or press `i` / `a` for an iOS
simulator / Android emulator.

## RevenueCat

UpShift uses RevenueCat to manage premium access and subscription
entitlements. The app is developed with Expo and can be previewed through
Expo Go — RevenueCat's SDK detects Expo Go automatically and falls back to a
preview mode so the subscription screens and logic can be demonstrated
without crashing, but **no real purchase is made in Expo Go**. Testing an
actual purchase requires an Expo development build (`eas build --profile
development`, or `npx expo run:ios` / `run:android`), which is what a real
release build also uses.

## Configuration notes

- Firebase's client config (in `firebase/config.ts`) and RevenueCat's public
SDK key (in `services/purchases.ts`) are intentionally hardcoded rather
than pulled from environment variables — both are public, client-embedded
identifiers by design (this is the normal, documented way both SDKs are
configured), not secrets. Nothing in this repository is a private/server
credential.
- `.env` holds the only values that vary per developer (Gemini, Google
Sign-In, USDA) and is gitignored — never committed. `.env.example` lists
the same keys with empty placeholders.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for
details.
