package expo.modules.upshiftbreaks

/**
 * Decides when a break is due. This is a line-for-line port of
 * services/breaks/usageTracker.ts (which is unit tested): change both together.
 */
class UsageTracker(
  private val thresholdMs: Long,
  var accumulatedMs: Long = 0L,
  var pending: Boolean = false,
) {
  private var lastSampleAt: Long? = null
  private var lastTriggerAt: Long? = null

  /** Returns true when a break should be launched now. */
  fun step(now: Long, watchedInForeground: Boolean, screenOn: Boolean): Boolean {
    val last = lastSampleAt
    val dt = if (last == null) 0L else (now - last).coerceIn(0L, MAX_GAP_MS)
    val counting = watchedInForeground && screenOn
    lastSampleAt = now
    if (counting) accumulatedMs += dt

    val trig = lastTriggerAt
    val guardOk = trig == null || now - trig >= REPEAT_GUARD_MS

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
