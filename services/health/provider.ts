// Where health data comes from. A device build registers one provider at startup; every other
// build (web, Expo Go, the current store builds) has none, and the Settings row stays hidden.
// Not yet implemented for any platform. See docs/health-import.md.

import type { ProviderResult } from './health';

export type HealthProvider = {
  name: 'Apple Health' | 'Health Connect';
  /** Asks for read access and returns the last `days` days. Never throws. */
  read(days: number): Promise<ProviderResult>;
};

let current: HealthProvider | null = null;
export const registerHealthProvider = (p: HealthProvider | null) => { current = p; };
export const getHealthProvider = (): HealthProvider | null => current;
