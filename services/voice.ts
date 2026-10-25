// Voice for the coach: text-to-speech (expo-speech) and speech-to-text
// (expo-speech-recognition). Both are lazy and guarded like services/haptics.ts,
// so a missing native module (Expo Go, web) just hides the buttons instead of
// crashing. Speech recognition needs a development build, not Expo Go.

let Speech: typeof import('expo-speech') | null = null;
let Recog: any = null;
try { Speech = require('expo-speech'); } catch { Speech = null; }
try { Recog = require('expo-speech-recognition').ExpoSpeechRecognitionModule; } catch { Recog = null; }

export const canSpeak = () => !!Speech;
export const canListen = () => {
  try { return !!Recog && Recog.isRecognitionAvailable?.() !== false; } catch { return false; }
};

export function speak(text: string) {
  try {
    Speech?.stop();
    // Strip markdown-ish symbols so the voice doesn't read "asterisk".
    Speech?.speak(text.replace(/[*_#`>]/g, ''), { rate: 1.0 });
  } catch { /* decoration */ }
}

export function stopSpeaking() {
  try { Speech?.stop(); } catch { /* ignore */ }
}

// Starts listening. onText gets the running transcript; onEnd fires once with
// the final transcript. Returns a stop function, or null if permission was
// denied or recognition is unavailable.
export async function listen(onText: (t: string) => void, onEnd: (final: string) => void): Promise<(() => void) | null> {
  if (!Recog) return null;
  try {
    const perm = await Recog.requestPermissionsAsync();
    if (!perm.granted) return null;
    let transcript = '';
    const subs: { remove: () => void }[] = [];
    const cleanup = () => subs.forEach(s => s.remove());
    subs.push(Recog.addListener('result', (e: any) => {
      transcript = e.results?.[0]?.transcript ?? transcript;
      onText(transcript);
    }));
    subs.push(Recog.addListener('error', () => { cleanup(); onEnd(''); }));
    subs.push(Recog.addListener('end', () => { cleanup(); onEnd(transcript); }));
    Recog.start({ lang: 'en-US', interimResults: true });
    return () => { try { Recog.stop(); } catch { /* ignore */ } };
  } catch {
    return null;
  }
}
