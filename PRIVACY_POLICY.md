# UpShift — Privacy Policy

**Last updated:** October 2026

UpShift ("the app") is a personal health and fitness tracking app. This policy
explains what data the app collects, why, who it is shared with, and how you
can delete it.

> Have a lawyer review this policy before launch. It describes the app as built;
> health data is regulated differently in different places (see `docs/coach-legal-review.md`).

---

## Who runs this app

UpShift is an independent project. Contact: **Ridu.1029384756@gmail.com**

## What data is collected

**Account information**
- Email address and a password (the password is handled by Firebase
  Authentication and is never visible to the developer)

**Profile information you enter**
- First name and last initial
- Age, height, weight, gender
- Activity level and fitness goal
- Chosen avatar (initials color, or a photo you upload) and language

**Health and activity data you log**
- Food entries and nutritional values
- Water intake and sleep hours
- Completed workouts
- Weight entries over time
- Optional daily check-ins (mood and muscle soreness)

**Progress data**
- Experience points, level, rank and daily streaks

**AI coach data (only if you use the coach)**
- The messages you send to the coach and its replies
- Photos of meals you choose to analyze
- If you leave "Personalize" on: your first name, goal, activity level and
  calorie target, and the coach may read your last 7 to 30 days of logged data
  (including your daily break tally above) to answer questions about your progress
  and your breaks
- Thumbs up/down ratings and problem reports you choose to send

**Mindful breaks (only if you turn them on)**
- On Android, the app uses Usage Access to see which app is in the foreground,
  and the list of apps you choose to include. It also notices whether a phone call
  is active, whether a navigation or fitness app is in front, and whether the phone
  is in car mode, so a break never interrupts them. On iPhone it uses Apple's Screen
  Time APIs, which show the app only a token for the apps you pick, never their
  names. All of this stays **on your device** and is not uploaded.
- Your break settings (how often, schedule, bedtime wind-down, style) are saved to
  your account so they follow you to a new phone.
- A small daily tally is saved to your account: how many breaks you finished,
  whether you then stayed or left, which of four reasons you tapped for opening an
  app, the mood (1 to 5) you tapped afterwards, which hour of the day each break was
  in, and how many emergency passes and strict sessions you used. It contains **no
  app names and no text you typed**. It is kept for 90 days.
- Your break streak (days in a row with a finished break).
- The home-screen widget shows the time to your next break. It reads from your
  device only.

**Technical data**
- Anonymous step events during onboarding (which step you viewed), tied to your
  account ID, to find where people drop out
- Basic security logs on our servers (for example, rate-limit and abuse
  counters for the coach)

The app does **not** collect your location, contacts, browsing history, or
advertising identifiers, and contains no advertising.

## How the data is used

- Profile details calculate your personalised calorie and water goals
- Logged food, water, sleep and workouts show your daily progress and history
- Completed activity verifies eligible daily quests
- Level, rank and streak power the progress and leaderboard features
- Coach data is used only to answer you, to apply safety checks, and to enforce
  usage limits
- Reports and ratings are used to improve and moderate the coach

Your data is **never** sold, rented, or shared with advertisers.

## AI coach and Google Gemini

When you use the coach, your messages (and any meal photo or profile data you
chose to share) are sent from our servers to **Google Gemini** to generate a
reply. The coach is an AI: it can be wrong, it is not a doctor or dietitian, and
it must not be used in an emergency. Coach chats are kept for **90 days** and
then deleted automatically; ratings and problem reports for **180 days**. You
can clear your chat history at any time in the coach, and turn off
personalization in the coach settings.

## Where the data is stored

Data is stored in **Google Firebase** (Authentication, Cloud Firestore and
Cloud Functions), operated by Google LLC, governed by the
[Firebase Privacy and Security policy](https://firebase.google.com/support/privacy).

Access is restricted by server-side security rules: each account can read and
write only its own data. The leaderboard and the AI coach's usage counters are
written only by our servers, not by the app.

## What other people can see

If you use the app, the following is visible to other signed-in users on the
leaderboard and to your friends:

- Your first name and last initial (for example, "Alex M.")
- Your avatar
- Your level, rank, total XP, and current streak
- Your mindful-break streak (a number of days; the server limits it to how old your
  account is) and the avatar frame you earned from it (a coloured ring)

The following is **never** visible to other users: your email, age, height,
weight, gender, anything you have logged, your coach chats, or your sleep and
workout details.

## Third-party services

- **Google Firebase** — sign-in, database, and the servers that run the coach
- **Google Gemini** — generates coach replies and analyzes meal photos
- **RevenueCat** — manages subscriptions. It receives your account ID and
  purchase status, and Apple or Google process the payment
- **Cloudinary** — stores your profile photo if you upload one
- **USDA FoodData Central** — when you search for a food, the search text you type
  is sent to the U.S. Department of Agriculture's public database. No account
  information is sent with that request.
- **Open Food Facts** — when you scan or type a barcode, only the barcode number is
  sent to this public food database. The camera picture stays on your phone.

## Your rights and choices

- **Access and correction:** your data is visible in the app, and profile details
  can be changed at any time.
- **Deletion:** go to **Settings → Your data → Delete account**. After you
  confirm your password, we delete your profile, logs, coach chats, friends,
  challenges, leaderboard entry, profile photo and subscription record, and then
  your sign-in. This cannot be undone. An active subscription is not cancelled
  automatically; cancel it in your app store settings. You can also email
  **Ridu.1029384756@gmail.com**.
- **Coach:** clear chats and turn off personalization any time.
- **Mindful breaks:** turn off anytime in Settings; revoke Usage Access or
  Screen Time permission in your device settings.

## Children's privacy

UpShift is not directed at children under 13, and accounts are not knowingly
created for them. If you believe a child under 13 has created an account,
contact **Ridu.1029384756@gmail.com** and it will be deleted.

## Data retention

Your data is kept for as long as your account exists. Coach chats and the daily
break tally are deleted after 90 days and coach feedback after 180 days. Deleting your account removes
everything described above, with one exception: to stop a free trial from being restarted by
deleting and re-creating an account, we keep a one-way hash of your email address (not the address
itself) and the date your trial began. It is used for nothing else, and you can ask us to remove
it by emailing Ridu.1029384756@gmail.com once your trial period would have ended.

## Security

All data is sent over encrypted HTTPS connections. Passwords are handled by
Firebase Authentication. The AI service key and payment keys are kept on our
servers, never in the app. Sign-in errors do not reveal whether an email has an
account, and account deletion requires you to re-enter your password.

## Changes to this policy

If this policy changes, the "Last updated" date above will change. Significant
changes will be communicated in the app.

## Contact

Questions about this policy or your data: **Ridu.1029384756@gmail.com**
