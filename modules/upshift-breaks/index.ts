// TypeScript surface of the Android mindful-breaks module. It is optional: on
// iOS, web, Expo Go, or a build that predates the module, `Native` is null and
// callers fall back gracefully.

import { requireOptionalNativeModule } from 'expo';

export type InstalledApp = { packageName: string; label: string };
export type NativeBreakConfig = { enabled: boolean; intervalMinutes: number; packages: string[]; running: boolean };
export type PendingBreak = { pkg: string; label: string };

type NativeApi = {
  isSupported(): boolean;
  hasUsageAccess(): boolean;
  canDrawOverlays(): boolean;
  openUsageAccessSettings(): void;
  openOverlaySettings(): void;
  openBatterySettings(): void;
  getInstalledApps(): Promise<InstalledApp[]>;
  setConfig(enabled: boolean, intervalMinutes: number, packages: string[]): void;
  getConfig(): NativeBreakConfig;
  getPendingBreak(): PendingBreak | null;
  markBreakDone(): void;
  returnToApp(pkg: string): boolean;
  moveToBack(): Promise<void>;
};

export const Native = requireOptionalNativeModule<NativeApi>('UpShiftBreaks');
export const isAvailable = Native != null;
export default Native;
