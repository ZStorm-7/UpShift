// Numbers for the Android "Today" home-screen widget. Pure so it can be tested;
// the native side only renders what it is given.

export type WidgetSnapshot = {
  day: string;
  questsDone: number;
  questsTotal: number;
  waterMl: number;
  waterGoalMl: number;
  streak: number;
};

const int = (n: unknown, max: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.min(Math.max(v, 0), max);
};

export function buildSnapshot(day: string, q: { questsDone: number; questsTotal: number; waterMl: number; waterGoalMl: number; streak: number }): WidgetSnapshot {
  const questsTotal = int(q.questsTotal, 20);
  return {
    day: typeof day === 'string' ? day.slice(0, 10) : '',
    questsDone: Math.min(int(q.questsDone, 20), questsTotal),
    questsTotal,
    waterMl: int(q.waterMl, 20000),
    waterGoalMl: Math.max(int(q.waterGoalMl, 20000), 1),
    streak: int(q.streak, 100000),
  };
}

export const sameSnapshot = (a: WidgetSnapshot | null, b: WidgetSnapshot): boolean =>
  !!a && a.day === b.day && a.questsDone === b.questsDone && a.questsTotal === b.questsTotal && a.waterMl === b.waterMl && a.waterGoalMl === b.waterGoalMl && a.streak === b.streak;
