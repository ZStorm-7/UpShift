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
- Expo Go for basic previews, or an Expo development build for native functionality such as full RevenueCat purchase testing

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

Scan the displayed QR code using Expo Go.

### 6. Run using an Expo development build

UpShift includes native functionality that cannot be fully tested through Expo Go.

Install the development client dependency if necessary:

```bash
npx expo install expo-dev-client
```

Then create or install an UpShift development build and start Metro using:

```bash
npx expo start --dev-client
```

Open the installed UpShift development build and connect it to the development server.

## RevenueCat

UpShift uses RevenueCat to manage premium access and subscription entitlements.

### Expo Go

RevenueCat supports a Preview API Mode when running through Expo Go. This allows the app to demonstrate subscription UI and subscription-related application logic without crashing.

Real purchases are not performed through Expo Go.

### Development Build

Full RevenueCat functionality requires an Expo development build.

This allows UpShift to communicate with RevenueCat's native SDK and test actual purchase and entitlement behavior.

The intended flow is:

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

For Shipaton development, RevenueCat's Test Store can be used to test the subscription flow without requiring a production App Store or Google Play release.

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
