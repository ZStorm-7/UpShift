// TypeScript surface of the Android mindful-breaks module. It is optional: on
// iOS, web, Expo Go, or a build that predates the module, `Native` is null and
// callers fall back gracefully.

import { requireOptionalNativeModule } from 'expo';

export type InstalledApp = { packageName: string; label: string };
export type NativeBreakConfig = { enabled: boolean; intervalMinutes: number; packages: string[]; completedToday: number; running: boolean };
export type PendingBreak = { pkg: string; label: string };

type NativeApi = {
  isSupported(): boolean;
  hasUsageAccess(): boolean;
  canDrawOverlays(): boolean;
  openUsageAccessSettings(): void;
  openOverlaySettings(): void;
  openBatterySettings(): void;
  getInstalledApps(): Promise<InstalledApp[]>;
  // `policyJson` is services/breaks/policy.ts's Policy, serialized.
  setPolicy(policyJson: string, packages: string[]): void;
  getConfig(): NativeBreakConfig;
  // Numbers for the Today widget: day (YYYY-MM-DD), quests done and total, water ml and goal, streak.
  setProgressSnapshot(day: string, questsDone: number, questsTotal: number, waterMl: number, waterGoalMl: number, streak: number): void;
  getPendingBreak(): PendingBreak | null;
  markBreakDone(): void;
  abandonBreak(): void;
  returnToApp(pkg: string): boolean;
  moveToBack(): Promise<void>;
};

export const Native = requireOptionalNativeModule<NativeApi>('UpShiftBreaks');
export const isAvailable = Native != null;
export default Native;
