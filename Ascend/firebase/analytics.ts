import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

// Lightweight, no-new-service analytics: every onboarding step transition
// gets written as its own document to a flat Firestore collection. No
// Firebase Analytics SDK, no dashboard to configure — just enough to answer
// "where do people give up during onboarding?" by querying this collection
// directly in the Firebase console or exporting it.
//
// Deliberately a WRITE-ONLY collection from the client's point of view (see
// firestore.rules): a user can log their own events but never read anyone's,
// including their own. This is an events log, not a user-facing feature, so
// there's no reason to expose read access and every reason not to — reading
// it back would mean shipping a query surface for data about how OTHER
// users behave, which has no product use and is one more thing that could
// leak.
export type OnboardingEventType = 'step_view' | 'onboarding_complete' | 'onboarding_abandoned';

// Numbered rather than named — OnboardingScreen's own step numbers
// (1..TOTAL_STEPS) are the source of truth, and mirroring them here means
// this can never drift out of sync with what the screen actually shows at
// each step, the way a hand-maintained name like "activity" would if the
// flow's steps ever get reordered or renamed.
export type OnboardingStep = number;

// Fire-and-forget by design: logging must never block or break onboarding
// itself. A failed write here (offline, rules typo, whatever) is silently
// swallowed — losing one analytics event is fine, losing a signup over it
// is not.
export function logOnboardingEvent(
  uid: string,
  step: OnboardingStep,
  eventType: OnboardingEventType
): void {
  addDoc(collection(db, 'onboardingEvents'), {
    uid,
    step,
    eventType,
    // Server-assigned so client clock skew can't scramble the ordering when
    // this data actually gets analyzed.
    at: serverTimestamp(),
  }).catch(() => {
    // Intentionally ignored — see comment above.
  });
}
