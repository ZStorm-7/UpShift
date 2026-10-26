import { Native } from '../modules/upshift-breaks';
import { sameSnapshot, type WidgetSnapshot } from './habits/widgetSnapshot';

let last: WidgetSnapshot | null = null;

// Sends today's numbers to the Android widget. No-op everywhere the native
// module is missing (iOS, web, Expo Go), and skips identical repeats.
export function pushWidgetSnapshot(s: WidgetSnapshot): void {
  if (!Native || sameSnapshot(last, s)) return;
  try {
    Native.setProgressSnapshot(s.day, s.questsDone, s.questsTotal, s.waterMl, s.waterGoalMl, s.streak);
    last = s;
  } catch {
    // widget is a nicety; never break the app for it
  }
}
