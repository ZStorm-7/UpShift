package expo.modules.upshiftbreaks

/**
 * Decides when a break is due. A line-for-line port of
 * services/breaks/usageTracker.ts and services/breaks/policy.ts (both unit
 * tested). Change all three together, then re-run the parity check described in
 * docs/mindful-breaks.md.
 */
class UsageTracker(
  var accumulatedMs: Long = 0L,
  var pending: Boolean = false,
) {
  private var lastSampleAt: Long? = null
  private var lastTriggerAt: Long? = null

  /** The basic rule. Returns true when a break should be launched now. */
  fun step(now: Long, watchedInForeground: Boolean, screenOn: Boolean, thresholdMs: Long): Boolean {
    val last = lastSampleAt
    val dt = if (last == null) 0L else (now - last).coerceIn(0L, MAX_GAP_MS)
    val counting = watchedInForeground && screenOn
    lastSampleAt = now
    if (counting) accumulatedMs += dt

    val guardOk = guardOk(now)

    // A break that was started but not finished comes back as soon as a watched app is used.
    if (pending && counting && guardOk) {
      lastTriggerAt = now
      return true
    }
    if (!pending && accumulatedMs >= thresholdMs && counting && guardOk) {
      accumulatedMs = 0L
      pending = true
      lastTriggerAt = now
      return true
    }
    return false
  }

  private fun guardOk(now: Long): Boolean {
    val trig = lastTriggerAt
    return trig == null || now - trig >= REPEAT_GUARD_MS
  }

  /** Advances the clock without counting anything (paused, outside the schedule, ...). */
  private fun idle(now: Long, screenOn: Boolean) {
    step(now, false, screenOn, Long.MAX_VALUE)
  }

  /** The full rule set. Same precedence as policy.ts `decide`. */
  fun decide(
    now: Long,
    watchedInForeground: Boolean,
    screenOn: Boolean,
    local: LocalTime,
    switchesLast5Min: Int,
    breaksToday: Int,
    inCall: Boolean,
    navigating: Boolean,
    workout: Boolean,
    policy: Policy,
  ): Action {
    if (!policy.enabled) { idle(now, screenOn); return Action.NONE }

    // 0. Exceptions beat everything, including strict mode and the wind-down.
    val e = policy.exceptions
    if ((e.calls && inCall) || (e.navigation && navigating) || (e.workouts && workout)) {
      idle(now, screenOn)
      return Action.NONE
    }

    // 1. Emergency pause.
    if (now < policy.pausedUntil) { idle(now, screenOn); return Action.NONE }

    // 2. Strict mode or the nightly wind-down.
    if (now < policy.strictUntil || BreakPolicy.inWindDown(policy.windDown, local)) {
      val counting = watchedInForeground && screenOn
      val ok = guardOk(now)
      idle(now, screenOn)
      if (counting && ok) { lastTriggerAt = now; return Action.STRICT }
      return Action.NONE
    }

    // 3. Outside the schedule: release any unfinished break.
    if (!BreakPolicy.inScheduleWindow(policy.schedule, local)) {
      idle(now, screenOn)
      pending = false
      accumulatedMs = 0L
      return Action.NONE
    }

    // 4. Daily cap.
    val capped = policy.dailyCap > 0 && breaksToday >= policy.dailyCap && !pending
    if (capped) { idle(now, screenOn); return Action.NONE }

    // 5. The normal rule.
    val threshold = BreakPolicy.effectiveThresholdMs(policy.intervalMin, policy.adaptive, local, switchesLast5Min)
    return if (step(now, watchedInForeground, screenOn, threshold)) Action.BREAK else Action.NONE
  }

  /** The user finished the exercise: clear the block and start a fresh interval. */
  fun complete() {
    accumulatedMs = 0L
    pending = false
  }

  companion object {
    const val MAX_GAP_MS = 5_000L
    const val REPEAT_GUARD_MS = 4_000L
  }
}
