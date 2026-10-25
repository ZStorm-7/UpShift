// Language-aware day and time labels, so the week chart and the schedule read
// naturally in each of the app's languages without a translation key per day.

const LOCALES: Record<string, string> = { en: 'en', es: 'es', fr: 'fr', zh: 'zh-CN', te: 'te-IN' };
export const localeFor = (lang: string) => LOCALES[lang] ?? 'en';

// weekday: 0 = Sunday ... 6 = Saturday. 4 January 2026 was a Sunday.
export function weekdayLabel(weekday: number, lang: string, style: 'short' | 'narrow' | 'long' = 'short'): string {
  const d = new Date(2026, 0, 4 + (((weekday % 7) + 7) % 7));
  return d.toLocaleDateString(localeFor(lang), { weekday: style });
}

// Minutes after midnight -> "9:00 AM" / "09:00", per the language's habits.
export function timeLabel(minutesOfDay: number, lang: string): string {
  const m = ((Math.round(minutesOfDay) % 1440) + 1440) % 1440;
  const d = new Date(2026, 0, 4, Math.floor(m / 60), m % 60);
  return d.toLocaleTimeString(localeFor(lang), { hour: 'numeric', minute: '2-digit' });
}

export function clockTimeLabel(epochMs: number, lang: string): string {
  return new Date(epochMs).toLocaleTimeString(localeFor(lang), { hour: 'numeric', minute: '2-digit' });
}

export const percentLabel = (fraction: number) => `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;

// m:ss under an hour, h:mm:ss from an hour up (a wind-down can be 8 hours long).
export const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
};

