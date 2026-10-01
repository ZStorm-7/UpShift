# UpShift

UpShift is a gamified fitness and nutrition app designed to make building healthier habits more engaging. It brings workouts, nutrition, sleep, progress tracking, and social motivation together in one place, with XP, ranks, achievements, streaks, quests, and leaderboards layered on top.

UpShift was built for the RevenueCat Shipaton 2026 and is being submitted for the Next Gen Award.

## Features

- Personalized workout plans that progress from beginner to advanced
- Workout tracking with muscle recovery information
- Nutrition tracking using USDA FoodData Central
- Barcode-based food logging
- AI-assisted meal descriptions and food recognition
- Custom and combination meals
- Sleep tracking with bedtime wind-down reminders
- Weight and progress tracking
- XP and leveling system
- Ranks, streaks, and streak freezes
- Achievements and trophies
- Daily quests that can be verified against logged activity
- Friends and public profiles
- Global leaderboard
- In-app messaging
- RevenueCat-powered premium access with a 7-day trial

## Built With

- React Native
- Expo SDK 57
- TypeScript
- Firebase Authentication
- Cloud Firestore
- Firebase Cloud Functions
- RevenueCat
- Google Gemini API
- USDA FoodData Central
- Cloudinary

## Running UpShift

### Requirements

You will need:

- Node.js
- npm
- An iOS or Android device, simulator, or emulator
- Expo Go for basic previews
- An Expo development build for full native RevenueCat purchase testing

## Installation

### 1. Clone the repository

```bash
git clone YOUR_REPOSITORY_URL
```

### 2. Enter the project

```bash
cd UpShift
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Copy:

```text
.env.example
```

to:

```text
.env
```

Then provide your own development credentials for the services listed in `.env.example`.

Do not commit `.env` or private API credentials to the repository.

### 5. Start UpShift with Expo Go

For a basic preview:

```bash
npx expo start --go
```

Scan the displayed QR code with your phone and open the project in Expo Go.

## RevenueCat

UpShift uses RevenueCat to manage premium access, subscription entitlements, and the app's premium access flow.

### Expo Go

When UpShift is run through Expo Go, RevenueCat operates in Preview API Mode.

This allows the app to demonstrate its paywall, subscription UI, and subscription-related logic without crashing. The RevenueCat integration is still present in the project, but Expo Go does not complete a real native in-app purchase.

In the Shipaton demo, UpShift is shown running through Expo Go, so the RevenueCat paywall and premium-access flow are demonstrated in Preview API Mode.

### Development Build

A full native purchase requires an Expo development build rather than Expo Go.

With a development build, UpShift can use RevenueCat's native SDK functionality to test the complete purchase and entitlement flow:

```text
UpShift Paywall
      ↓
RevenueCat Purchase
      ↓
CustomerInfo Updated
      ↓
Premium Entitlement Activated
      ↓
Premium Features Unlocked
```

The intended production flow uses RevenueCat to determine whether a user's premium entitlement is active before unlocking premium functionality.

For Shipaton development and testing, RevenueCat's Test Store can be used with a compatible development build to test purchases without requiring a production App Store or Google Play release.

## Configuration Notes

Firebase's client configuration and RevenueCat's public SDK key are client-side configuration values.

Private server credentials, private API keys, and `.env` values should never be committed to this repository.

The `.env.example` file contains placeholders showing which environment variables are required without exposing the actual private values.

## Security

Before committing changes, make sure the repository does not contain:

- `.env`
- Gemini private API credentials
- Firebase service-account credentials
- Private RevenueCat API keys
- Google credentials intended to remain secret
- Any other server-side credentials

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
