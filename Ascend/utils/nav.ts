// Navigation helpers.
//
// The only thing in here is a safe replacement for navigation.goBack(), and
// it exists because of a real error users were seeing in the logs:
//
//   ERROR  The action 'GO_BACK' was not handled by any navigator.
//          Is there any screen to go back to?
//
// goBack() is only valid when the current screen actually has something
// beneath it in the stack. That is NOT guaranteed in this app, for two
// reasons that are both by design:
//
//   1. Auth and sign-out navigate with `replace` / `reset` (see AuthScreen
//      and SettingsScreen), which deliberately leave a single-entry stack so
//      the user can't swipe back into a signed-out session. Any screen that
//      then becomes the first route has nothing behind it.
//   2. RootNavigator picks `initialRouteName` dynamically from auth +
//      subscription + profile state, so on a cold launch the user can land
//      DIRECTLY on Dashboard, Onboarding, Liability or Subscription — again
//      with an empty stack.
//
// In dev this only logs a warning, but the user-visible effect is worse than
// a log line: the back arrow silently does nothing, and a screen that calls
// goBack() after saving (SleepScreen, EditProfile) strands the user on a
// screen they've already finished with.
//
// So: go back when there IS somewhere to go back to, and otherwise fall back
// to a sensible root rather than doing nothing at all.

/** Where to land when there's no back entry. Dashboard is the app's home for
 *  every signed-in screen that has a back button. */
const DEFAULT_FALLBACK = 'Dashboard';

export function safeGoBack(navigation: any, fallback: string = DEFAULT_FALLBACK) {
  // Optional-chained throughout: screens receive `navigation` as an untyped
  // prop, and canGoBack is absent on some older/mocked navigator objects.
  // A missing helper should degrade to "try to navigate", never throw.
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
    return;
  }
  navigation?.navigate?.(fallback);
}
