// Firebase Auth throws errors with a machine-readable `code` (e.g.
// "auth/invalid-email") and a raw `message` meant for developers, not users.
// This translates the common codes into plain language for the UI.
const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address doesn’t look right. Double-check it and try again.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  // Firebase's own floor is 6, but this app requires 8 (see
  // PASSWORD_RULES in components/PasswordStrength.tsx) — quote the rule the
  // user was actually shown, not the one the backend happens to use.
  'auth/weak-password': 'Password should be at least 8 characters.',
  'auth/email-already-in-use': 'An account already exists with that email. Try logging in instead.',
  'auth/user-not-found': 'No account found with that email. Check the email, or sign up instead.',
  'auth/wrong-password': 'That password isn’t right. Try again.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/invalid-login-credentials': 'Email or password is incorrect.',
  'auth/too-many-requests': 'Too many attempts. Wait a bit before trying again.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/network-request-failed': 'Couldn’t reach the server. Check your internet connection and try again.',
  'auth/operation-not-allowed': 'This sign-in method isn’t enabled. Contact support.',

  // Phone sign-in (see AuthScreen's phone flow, backed by
  // expo-firebase-recaptcha + signInWithPhoneNumber).
  'auth/invalid-phone-number': 'That phone number doesn’t look right. Include the country code, e.g. +1 555 123 4567.',
  'auth/missing-phone-number': 'Enter a phone number.',
  'auth/invalid-verification-code': 'That code isn’t right. Double-check it and try again.',
  'auth/missing-verification-code': 'Enter the 6-digit code we sent you.',
  'auth/code-expired': 'That code expired. Request a new one.',
  'auth/invalid-verification-id': 'That verification session expired. Request a new code.',
  'auth/quota-exceeded': 'Too many verification attempts. Try again later.',
  'auth/captcha-check-failed': 'reCAPTCHA verification failed. Try again.',

  // Google / Apple credential sign-in.
  'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
  'auth/credential-already-in-use': 'This account is already linked to another user.',
  'auth/popup-closed-by-user': 'Sign-in was closed before finishing. Try again.',
  'auth/user-cancelled': 'Sign-in was cancelled.',
};

export function getAuthErrorMessage(err: any): string {
  const code = err?.code as string | undefined;
  if (code && MESSAGES[code]) {
    return MESSAGES[code];
  }
  // Fall back to something readable even for codes we haven't mapped,
  // rather than showing Firebase's raw "Firebase: Error (auth/xyz)." text.
  if (code?.startsWith('auth/')) {
    return code.replace('auth/', '').replace(/-/g, ' ');
  }
  return err?.message || 'Something went wrong. Please try again.';
}
