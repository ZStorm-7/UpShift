// Firebase Auth throws errors with a machine-readable `code` (e.g.
// "auth/invalid-email") and a raw `message` meant for developers, not users.
// This translates the common codes into plain language for the UI.
const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address doesn’t look right. Double-check it and try again.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/email-already-in-use': 'An account already exists with that email. Try logging in instead.',
  // Same wording as a wrong password, so login can't be used to find out which
  // emails have accounts.
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/invalid-login-credentials': 'Email or password is incorrect.',
  'auth/too-many-requests': 'Too many attempts. Wait a bit before trying again.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/network-request-failed': 'Couldn’t reach the server. Check your internet connection and try again.',
  'auth/requires-recent-login': 'For your security, please enter your password again.',
  'auth/operation-not-allowed': 'This sign-in method isn’t enabled. Contact support.',
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
