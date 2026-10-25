# AI Coach: legal review checklist

**Status: DRAFT, not reviewed by a lawyer.** The disclaimer text was drafted by
an AI assistant. A disclaimer does not by itself guarantee protection from
liability, and enforceability varies by country and state. Have a qualified
lawyer review the text and the points below before a public release.

The text lives in `i18n/translations.ts` (`coachLegalBody`, `coachWarning`) in
English, Spanish, French, Mandarin and Telugu. The non-English versions are
machine translations and need a fluent reviewer too.

When the text changes materially, bump `COACH_CONSENT_VERSION` in
`services/coach.ts` **and** `CONSENT_VERSION` in `functions/src/config.ts`.
Everyone is then asked to accept it again, and the server refuses coach calls
until they do.

## Questions for the lawyer

1. Is the limitation-of-liability wording enforceable where we operate, and
   should it also appear in the Terms of Service (not just in the coach UI)?
2. Health and fitness advice: do we need stronger "not medical advice" wording,
   or a requirement to confirm the user has been cleared to exercise?
3. Food photos, weight, sleep and mood are health-related data. Which regimes
   apply (GDPR special-category data, CCPA/CPRA sensitive data, Washington
   My Health My Data Act, other state laws)? Do we need explicit consent text
   beyond what the first-use card gives?
4. Google Gemini processes coach messages and photos. Is our privacy policy
   accurate about this, and do we need a data-processing agreement or to opt out
   of model training? (Paid-tier Gemini API terms differ from the free tier.)
5. Minors: what age gate is required for an app with an AI health coach?
6. App store rules: Apple and Google both have health-app and AI-content
   policies. Is the in-app reporting flow (`coachFeedback`) sufficient?
7. Allergies: the meal planner screens for allergens but can miss some.
   Is the warning on every meal plan adequate?
8. Where do disputes go (governing law, arbitration, class-action waiver)?
