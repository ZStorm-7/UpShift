// Avatar frames that friends can see. The server derives the frame from the longest
// break streak it accepted, so nobody can claim a frame they haven't earned.
// Keep the day counts in step with FRAMES in services/breaks/rewards.ts (a test checks).

export const FRAME_DAYS = { dawn: 3, aurora: 7, zen: 30 } as const;
export type FrameId = keyof typeof FRAME_DAYS;

export function frameForLongest(longest: number): FrameId | null {
  const n = Math.floor(Number(longest)) || 0;
  if (n >= FRAME_DAYS.zen) return 'zen';
  if (n >= FRAME_DAYS.aurora) return 'aurora';
  if (n >= FRAME_DAYS.dawn) return 'dawn';
  return null;
}
