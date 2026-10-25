package expo.modules.upshiftbreaks

/** Port of the pure parts of services/breaks/policy.ts. */

data class Schedule(val enabled: Boolean, val days: Set<Int>, val startMin: Int, val endMin: Int)

data class Policy(
  val enabled: Boolean,
  val intervalMin: Int,
  val schedule: Schedule,
  val dailyCap: Int,
  val adaptive: Boolean,
  val pausedUntil: Long,
  val strictUntil: Long,
)

/** dayOfWeek: 0 = Sunday ... 6 = Saturday, like JavaScript's Date#getDay. */
data class LocalTime(val dayOfWeek: Int, val minutesOfDay: Int)

enum class Action { NONE, BREAK, STRICT }

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
}
