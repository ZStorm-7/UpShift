// Deliberately pragmatic, not RFC 5322-complete: a full spec-compliant email
// regex is notoriously long and still can't tell you an address is real (see
// the compliance write-up this came out of — that needs a paid verification
// API, a separate decision). This one goal is narrower: reject the "asdf"
// class of input that isn't even shaped like an email, before it reaches
// Firebase and either bounces with a confusing error or — for something
// like "a@a" — actually creates an unrecoverable account.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_SHAPE.test(email.trim());
}
