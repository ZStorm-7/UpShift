package expo.modules.upshiftbreaks

/** Port of the pure parts of services/breaks/policy.ts. */

data class Schedule(val enabled: Boolean, val days: Set<Int>, val startMin: Int, val endMin: Int)

data class WindDown(val enabled: Boolean, val startMin: Int, val endMin: Int)

data class Exceptions(val calls: Boolean, val navigation: Boolean, val workouts: Boolean)

data class Policy(
  val enabled: Boolean,
  val intervalMin: Int,
  val schedule: Schedule,
  val dailyCap: Int,
  val adaptive: Boolean,
  val windDown: WindDown,
  val exceptions: Exceptions,
  val pausedUntil: Long,
  val strictUntil: Long,
)

/** dayOfWeek: 0 = Sunday ... 6 = Saturday, like JavaScript's Date#getDay. */
data class LocalTime(val dayOfWeek: Int, val minutesOfDay: Int)

enum class Action { NONE, BREAK, STRICT }

enum class WidgetKind { COUNTDOWN, STRICT, PAUSED, OUTSIDE, DONE, OFF }

data class WidgetState(val kind: WidgetKind, val minutes: Int)

object BreakPolicy {
  const val NIGHT_START_MIN = 22 * 60
  const val NIGHT_END_MIN = 5 * 60
  const val RAPID_SWITCHES = 12
  const val NIGHT_FACTOR = 0.5
  const val RAPID_FACTOR = 0.7
  const val MIN_INTERVAL_MIN = 5

  fun inScheduleWindow(s: Schedule, local: LocalTime): Boolean {
    if (!s.enabled) return true
    if (s.days.isEmpty()) return false
    val m = local.minutesOfDay
    if (s.startMin == s.endMin) return s.days.contains(local.dayOfWeek)
    if (s.startMin < s.endMin) return s.days.contains(local.dayOfWeek) && m >= s.startMin && m < s.endMin
    val prevDay = (local.dayOfWeek + 6) % 7
    return (s.days.contains(local.dayOfWeek) && m >= s.startMin) || (s.days.contains(prevDay) && m < s.endMin)
  }

  /** Is `local` inside the nightly wind-down? Daily, so every day counts. */
  fun inWindDown(w: WindDown, local: LocalTime): Boolean {
    if (!w.enabled) return false
    return inScheduleWindow(Schedule(true, setOf(0, 1, 2, 3, 4, 5, 6), w.startMin, w.endMin), local)
  }

  /** When the wind-down that `local` is inside ends, as a timestamp. Whole minutes. */
  fun windDownEndsAt(nowMs: Long, local: LocalTime, w: WindDown): Long {
    var mins = (w.endMin - local.minutesOfDay + 1440) % 1440
    if (mins == 0) mins = 1440
    return nowMs + mins * 60_000L
  }

  fun effectiveThresholdMs(baseMin: Int, adaptive: Boolean, local: LocalTime, switchesLast5Min: Int): Long {
    val base = baseMin * 60_000L
    if (!adaptive) return base
    var factor = 1.0
    if (local.minutesOfDay >= NIGHT_START_MIN || local.minutesOfDay < NIGHT_END_MIN) factor *= NIGHT_FACTOR
    if (switchesLast5Min >= RAPID_SWITCHES) factor *= RAPID_FACTOR
    val floor = minOf(base, MIN_INTERVAL_MIN * 60_000L)
    // JavaScript's Math.round rounds halves up; Kotlin's roundToLong rounds half away from zero. Same for positives.
    return maxOf(floor, Math.round(base * factor))
  }

  private fun ceilMinutes(ms: Long): Int = ((maxOf(0L, ms) + 59_999L) / 60_000L).toInt()

  /** What the home-screen widget shows. Twin of `widgetState` in policy.ts. */
  fun widgetState(
    now: Long, local: LocalTime, policy: Policy, accumulatedMs: Long, pending: Boolean, breaksToday: Int, switchesLast5Min: Int,
  ): WidgetState {
    if (!policy.enabled) return WidgetState(WidgetKind.OFF, 0)
    if (now < policy.pausedUntil) return WidgetState(WidgetKind.PAUSED, ceilMinutes(policy.pausedUntil - now))
    if (now < policy.strictUntil) return WidgetState(WidgetKind.STRICT, ceilMinutes(policy.strictUntil - now))
    if (inWindDown(policy.windDown, local)) {
      return WidgetState(WidgetKind.STRICT, ceilMinutes(windDownEndsAt(now, local, policy.windDown) - now))
    }
    if (!inScheduleWindow(policy.schedule, local)) return WidgetState(WidgetKind.OUTSIDE, 0)
    if (policy.dailyCap > 0 && breaksToday >= policy.dailyCap && !pending) return WidgetState(WidgetKind.DONE, 0)
    val threshold = effectiveThresholdMs(policy.intervalMin, policy.adaptive, local, switchesLast5Min)
    return WidgetState(WidgetKind.COUNTDOWN, ceilMinutes(threshold - accumulatedMs))
  }
}
