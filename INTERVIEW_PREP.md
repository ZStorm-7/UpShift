# UpShift — Technical Interview Prep

For internship / junior engineering interviews. Everything here is grounded in
decisions actually in your codebase, so every claim survives a follow-up
question.

**One rule above all: never claim something you can't explain.** An interviewer
who senses memorisation will dig until you break. An interviewer who sees you
reason honestly — including "I got that wrong at first, here's what I learned" —
will trust everything else you say. Your real debugging stories are worth more
than a polished summary.

---

## 1. The 60-second pitch

Practise until it's natural, not recited.

> "UpShift is a gamified health tracker I built with React Native and Expo,
> backed by Firebase Auth and Firestore. You log food, water, sleep and
> workouts, and you earn XP toward levels and ranks. The interesting part isn't
> the tracking — it's that the app verifies quests against your real logged
> data instead of trusting a checkbox, and that quests are gated by how much
> history your account actually has, so a new user never gets an impossible
> quest like 'keep a 7-day streak alive' on day one. It's about 95 quests
> across five difficulty tiers, five languages, and a cross-user leaderboard
> that required a separate security model from the rest of the app."

Why this works: it names the stack fast, then pivots to a *design problem you
solved*. "I built a fitness app" is forgettable. "I had to reason about
achievability of tasks relative to account history" is not.

---

## 2. Architecture — know this cold

```
App.tsx                  Navigation + auth-based initial route
├── context/UserContext  Auth state + profile, via React Context
├── i18n/                Translation layer (5 languages, 116 keys)
├── screens/             Welcome, Auth, Onboarding, Dashboard,
│                        Nutrition, Workout, History, Leaderboard, Settings
├── firebase/            Firestore access + domain logic
│   ├── progress.ts      Day keys, XP math, history counting
│   ├── quests.ts        Quest pool, tiers, noon-cycle logic
│   ├── questVerify.ts   Auto-verification predicates
│   ├── streaks.ts       Consecutive-day streak math
│   └── leaderboard.ts   Public cross-user data
├── data/                Static data + pure helpers
└── services/            External APIs (Cloudinary)
```

**The organising principle**, if asked: pure logic is separated from UI. Streak
math, XP math and quest selection are plain functions with no React and no
Firestore calls in them. That's *why* I could unit-test the streak date logic
across month and year boundaries without a device or an emulator.

### The Firestore data model — be able to draw this

```
users/{uid}                     → profile (private)
users/{uid}/days/{YYYY-MM-DD}   → food, water, sleep, workouts (resets daily)
users/{uid}/meta/stats          → XP + level (cumulative, never resets)
users/{uid}/meta/quests         → active quests + cycle key
users/{uid}/meta/streak         → current + longest streak
users/{uid}/meta/weightLog      → weight over time
users/{uid}/meta/customFoods    → user-built combo meals
leaderboard/{uid}               → PUBLIC subset only
```

**Why days are keyed by date string:** daily data resets for free. There's no
cron job, no cleanup, no "is this from today?" check — a new day is simply a
different document. If asked what you'd change: "keys are a natural sort order,
which made the 7-day history query trivial, but it also means I can't query
across days efficiently without reading each document. At real scale I'd
denormalise weekly aggregates."

---

## 3. Five decisions you can defend deeply

Pick two or three to go deep on. Interviewers value depth over breadth.

### A. The noon reset problem

**The problem:** quests reset at noon, but everything else resets at midnight.

**The naive approach:** compare timestamps. Fragile and hard to reason about.

**What I did:** compute a "quest cycle key" — if the current hour is before
noon, subtract a day; then format as `YYYY-MM-DD`. That string identifies which
noon-to-noon window you're in. The app stores it with the quest list, and on
load compares stored key to computed key. Different → generate new quests.

**Why it's good:** the entire reset mechanism is one string comparison. No
timers, no scheduled jobs, no server. It also self-heals — an app closed for a
week comes back and immediately computes the right cycle.

**Follow-up you should expect — "what about timezones?"**
`new Date()` and `getHours()` already use the device's own timezone, so it's
correct anywhere with zero timezone code. The honest limitation: if a user flies
across timezones mid-cycle, their reset shifts. For this app that's acceptable —
"noon where you are" is arguably the right behaviour anyway.

### B. Quests that verify themselves

**The problem:** quests were pure honor system — tap and get XP whether or not
you did it. But the app already *knew* your calorie total, water total, sleep
hours, and workout count.

**What I did:** a map of quest ID → predicate over today's real data. 15 of 95
quests auto-complete when the data proves they're earned.

**The judgment call worth highlighting:** I deliberately did *not* fake
verification for quests the app can't observe. "Take a 10-minute walk outside"
has no backing data. Pretending to verify it would be worse than leaving it
manual — so the UI shows an ⚡ AUTO badge marking which quests the app actually
checks. Being honest about the limits of your data is a design decision.

**Follow-up — "how do you avoid double-awarding XP?"**
Completion goes through one batched function. Logging a large meal can satisfy
several quests at once; completing them one at a time meant each computed its
new XP from the same stale starting value, so later writes clobbered earlier
ones. Batching makes it one read-modify-write.

### C. The leaderboard security model

**The problem:** every rule locked users out of each other's data — correct for
privacy, fatal for ranking.

**What I did:** a separate top-level `leaderboard/{uid}` collection holding
*only* public fields. Rules allow any signed-in user to read, but writes require
`request.auth.uid == userId`, so nobody can forge another person's score.

**Why not just open up the user document?** It holds weight, age, email and
every meal. Exposing it to enable a scoreboard would be a serious privacy leak.
Copying a deliberate subset is the right shape.

**Follow-up — "how do you sort it?"**
You can't sort on level and XP separately — level 9 with 90 XP has earned more
than level 10 with 0. So I store one cumulative `totalXP = (level-1)*100 +
currentXP` and rank on that. Firestore sorts and limits server-side, so it
doesn't download the collection to sort locally.

### D. Quest gating by real history

**The problem:** a brand-new account could be handed "Beat yesterday's total
sets." There is no yesterday. The quest was uncompletable for a full cycle.

**What I did:** each quest declares how many days of prior history it needs.
The app counts days that have *actual logged activity* — not account age, and
not merely-existing documents.

**Why that distinction matters, and it's a good thing to say out loud:**
account age would hand streak quests to someone who signed up and ignored the
app for a week. They'd be exactly as impossible. Measuring real data measures
the thing that actually makes the quest achievable.

**The subtle part:** a stored quest set can contain a now-ineligible quest. So
on load I check every stored quest and redraw the whole set if any fail. The
evicted quest isn't deleted — it's filtered from the *draw*, so it returns
automatically once the account qualifies.

### E. Deriving instead of duplicating

A theme you can point to across the codebase:

- Quests declare a **tier**; XP is derived from a tier→XP map. Changing what
  "Ultra" is worth updates all 7 Ultra quests at once, and two Hard quests
  can't accidentally pay different amounts.
- Rank thresholds live in one module used by both Dashboard and Leaderboard —
  two copies would drift the first time a threshold changed.
- The `avatar` field holds either `preset:🦊` or a URL, and the prefix tells you
  which. One field instead of two with an unenforced "only one may be set" rule.
- Saved combo meals are converted to the same shape as database foods, so they
  flow through the existing search and logging code unchanged.

**The general principle:** make new things look like things the existing code
already understands, and you inherit its behaviour for free.

---

## 4. Bugs you found — tell these as stories

Debugging stories are the highest-signal thing you can offer. They show how you
think when things go wrong, which is most of the job.

### The Firestore rules bug

Symptom: `FirebaseError: Missing or insufficient permissions` after adding
XP persistence.

The rules explicitly matched `users/{uid}` and `users/{uid}/days/{dayId}` — but
I'd added a new `meta/` subcollection, which wasn't matched, so it fell through
to the deny-all catch-all.

**The part that makes it a good story:** I isolated it by temporarily
publishing a permissive rule to confirm rules were the cause rather than the
client code, then fixed the specific gap. And the *durable* fix wasn't adding
`meta/` — it was switching to a nested `{document=**}` wildcard so any future
subcollection is covered automatically. Fixing the class of bug, not the
instance.

### Water that silently disappeared

Logging water did `Math.min(waterTotal + amount, waterGoal)`. It capped the
stored total at the goal — so drinking past your goal was silently discarded,
and one quest ("drink 500ml beyond your goal") was *literally impossible*.

**Why it's worth telling:** I found it by asking "is every quest actually
achievable?" rather than by hitting the bug. The cap was reasonable-looking
code doing the wrong thing — the UI wanted a capped *bar*, and someone capped
the *data* instead. Now the bar caps at 100% and the stored number is truthful.

### The TypeScript literal-type trap (this one bit twice)

```ts
export const API_KEY = 'abc123';
if (API_KEY === 'YOUR_KEY_HERE') { ... }  // compile error
```

TypeScript infers the *literal type* `'abc123'`, not `string`. Comparing it to a
different literal narrows the type to `never`, and then even `.length` fails.
Fix: annotate `: string`.

**Why mentioning this is good:** it shows you understand type *inference*, not
just type annotation — and that you recognised the same root cause the second
time it appeared in a different file.

---

## 5. Questions they will ask — and honest answers

**"What would you do differently?"**
Never say "nothing." Good answers:
- Write tests earlier. I tested streak date math and rank thresholds, but only
  after the logic existed. Bugs like the water cap would have been caught by
  a test asserting every quest is achievable.
- The Dashboard is too big. It handles quests, water, sleep, weight, streaks,
  leaderboard publishing and the clock. I'd extract custom hooks —
  `useQuests()`, `useDailyProgress()`.
- I'd design the data model with querying in mind. Date-keyed documents are
  elegant for daily reset but awkward for "show me last month."

**"How does it scale?"**
Be honest about the boundaries:
- Leaderboard sorts and limits server-side, so it's fine at scale.
- Counting history days reads the whole `days` collection per Dashboard load —
  that's fine at 30 days, wasteful at 3 years. I'd cache the count in `meta/stats`.
- Firestore charges per read; the Dashboard does several on every focus. I'd
  batch them or use a real-time listener instead of re-fetching.

**"Why Firebase over your own backend?"**
Auth is genuinely hard to get right, and the security-rules model let me
enforce access control server-side without running a server. The tradeoff is
vendor lock-in and per-read pricing. The pain point I hit for real: Firebase
Storage now requires a paid plan, which forced me to move image uploads
elsewhere — a concrete lesson in dependency risk.

**"What was hardest?"**
Good honest answer: reasoning about *time*. Three different notions of "a day"
coexist — calendar day for food/water, noon-to-noon for quests, and
consecutive-days for streaks. Each needed its own representation, and the
streak logic needed real tests because string comparison can't tell you that
Aug 31 → Sep 1 is consecutive.

**"Is it live? How many users?"**
Don't inflate. "It's built and I'm going through Play Store closed testing —
Google requires 12 testers for 14 days before production." That's a real,
specific answer that shows you understand shipping, which most candidates
don't.

---

## 6. Before the interview

- [ ] Have the app **installed on your phone**, ready to demo in 30 seconds
- [ ] Know the demo path: sign up → onboarding → log food → complete a quest →
      show the leaderboard
- [ ] Have your **GitHub repo public and the README readable**
- [ ] Re-read `firestore.rules` — security questions are common and you have a
      genuinely good answer
- [ ] Be able to draw the data model on a whiteboard from memory
- [ ] Prepare one question to ask *them* about their codebase — how they handle
      testing, or how they decide when to build vs. buy infrastructure

**On honesty:** parts of this app were built with AI assistance. If asked,
say so plainly — it's increasingly normal, and being cagey about it is far
worse than being direct. What matters is whether *you understand the code*,
and this document exists so that you genuinely do. Never claim you wrote
something you couldn't now modify unaided.
