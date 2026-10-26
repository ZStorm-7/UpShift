# Congressional App Challenge 2026: submission kit for UpShift

**Deadline: 12:00 PM EDT, Monday, October 26, 2026.** After that the submission can't be changed.
Submit at congressionalappchallenge.us (you're already registered).

Everything below is a draft. The judges are reading about *you*, so rewrite the answers in
your own words; the parts in [brackets] are things only you know.

---

## Checklist (do in this order)
1. [ ] Record the demo video (script below), 1 to 3 minutes. Over 3 minutes can be penalised.
2. [ ] Upload to YouTube or Vimeo and set it to **Public** (not Unlisted, not Private).
3. [ ] Open the video in a private/incognito window to confirm anyone can watch it.
4. [ ] Paste the link and the answers into the application.
5. [ ] Include the AI disclosure (section below) in the application. The rules require it.
6. [ ] If on a team, every teammate is listed and has completed their own profile.
7. [ ] Submit well before noon EDT (aim for 11:00). Screenshot the confirmation.
8. [ ] After the deadline, each person completes the Exit Questionnaire individually.

Keep the source code and a working build ready: judges may ask to see the app and code, and
not providing them means disqualification.

---

## Demo video script (about 2:30)

The rules require the video to show: **each participant's name, the app's name, the purpose
in one clear sentence, the target audience, the tools and languages used, and the app working.**

| Time | On screen | Say |
|---|---|---|
| 0:00-0:15 | You, or the Welcome screen | "Hi, I'm [your name] from [school], [city]. This is **UpShift**." |
| 0:15-0:25 | Dashboard | "UpShift turns healthy habits into a game, so teens build fitness, nutrition and screen-time habits that actually stick." *(one sentence: the purpose)* |
| 0:25-0:35 | Dashboard | "It's for teens and young adults who want to get healthier but lose motivation after a few days." *(audience)* |
| 0:35-0:55 | Daily quests, tick one; XP ring fills | Show quests, XP and levels, streaks. |
| 0:55-1:15 | Log water, log a food (search "chicken"), Nutrition ring | Logging is quick; calories and macros update. |
| 1:15-1:30 | Workout: tap sets, Finish, summary | Workouts adapt to your level; XP depends on the work done. |
| 1:30-1:50 | Settings > Mindful breaks > Try it (breathing screen) | "After time in apps you choose, UpShift gives you a 15-second breathing break." |
| 1:50-2:05 | Friends, leaderboard, a challenge | Friend codes, leaderboard, 1-on-1 challenges. |
| 2:05-2:20 | Coach: open it, show the disclaimer, ask a question | AI coach with safety screen, daily limits, and a clear "not medical advice" label. |
| 2:20-2:35 | You, or a slide listing tools | "I built it with **TypeScript, React Native and Expo**, **Firebase** (login, database, cloud functions), and Google's **Gemini** API for the coach. I used **Claude, an AI assistant,** for parts of the code, which I've disclosed in my submission." |
| 2:35-2:45 | Logo | "Thanks for watching." |

Tips: record the phone screen (or the web build) with no notifications showing, use a test
account with some data already logged, speak slowly, and don't read the script word for word.

---

## Answers to the six questions (drafts, rewrite in your own words)

**1. What is the title of your app?**
UpShift

**2. Explain the app's purpose.**
UpShift helps teens build healthy habits by turning them into a game. You get daily quests, XP,
levels and streaks for working out, eating well, drinking water and sleeping, and you can
compete with friends. It also gives short breathing breaks after time in apps you choose, and an
AI coach that answers fitness and nutrition questions with clear safety limits.

**3. What inspired you to create this app?**
[Your real story. For example: something you noticed about yourself or friends: starting a
gym routine and quitting, losing track of what you eat, or scrolling for hours. Why a game?
Why for teens?]

**4. What technical/coding difficulty did you face, and how did you address it?**
Pick one you really worked on. Options from this project:
- *Keeping the leaderboard fair.* At first the app wrote its own score, so a modified app could
  post any number. I moved score writes into a Firebase Cloud Function that checks every field
  and limits how fast XP can rise, and locked the database so the app can't write scores directly.
- *The free trial could be reset.* The trial start date was stored where the user could edit
  it. I moved it to a server-only record, plus a hashed email so deleting and re-creating an
  account doesn't restart the trial.
- *Keeping the AI key secret.* Calling Gemini from the app would expose the API key. The coach
  now goes through a Cloud Function that holds the key, checks consent, and enforces a daily limit.
[Say which parts you did yourself and what you learned.]

**5. What did you learn while participating in the CAC? What was your biggest takeaway?**
[Your own answer. Ideas: anything that runs on the user's phone can be changed, so rules have to
be enforced on a server; testing with real accounts finds bugs that reading the code doesn't;
accessibility (contrast, button sizes) matters.]

**6. What would you change about your app in a 2.0 version?**
Barcode scanning and photo logging for food, real weight-and-reps progression for workouts,
Apple Health / Health Connect so you don't type steps and sleep, group challenges, and a
weekly review that explains your own trends.

---

## AI usage and tools disclosure (required by the rules)

The rules allow AI tools only if **all** AI use is disclosed, AI supports specific parts rather
than the entire project, and the student shows significant personal contribution and
understanding. Be accurate here; judges can ask for the source code and its history.

Suggested text (edit so it's true):

> **AI use.** I used Claude (Anthropic), an AI coding assistant, during development. [Describe what
> you wrote yourself: e.g. the original app (Aug 2026): screens for welcome, sign-up, onboarding,
> dashboard, workouts and nutrition; Firebase setup; friends, challenges and reactions; the visual
> design; and all product decisions.] Claude wrote code at my direction for: the AI coach
> (including its server-side Cloud Function), the mindful-breaks feature, security changes
> (server-side scores, trial and account deletion), accessibility and design fixes, translations,
> and automated tests. I reviewed, tested and directed all of it. The app's AI coach itself uses
> Google's Gemini API at runtime.
>
> **Tools and libraries.** TypeScript, React Native 0.86, Expo SDK 57, React Navigation, React
> Native Reanimated and SVG, Firebase (Authentication, Firestore, Cloud Functions), Google Gemini
> API, RevenueCat (subscriptions), Cloudinary (profile photos), USDA FoodData Central (food
> search), react-native-device-activity (iPhone Screen Time), Expo audio/haptics/notifications/
> speech, Google Fonts (Fraunces, Instrument Sans/Serif, Plus Jakarta Sans), Playwright and
> axe-core (testing).

Be ready to explain any part of the code you show in the video.

**Honest note.** By commit count, 13 of the 21 commits in this repository were written by Claude in
the last few days, including most of the newer features. The rules say AI "must not constitute
the entirety of the technical development" and that you must show "significant individual
contributions." If you're unsure whether your share is enough, the safest demo is to feature the
parts you built and understand best, and disclose the rest as above.
