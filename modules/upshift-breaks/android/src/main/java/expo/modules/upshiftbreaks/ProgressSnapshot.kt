package expo.modules.upshiftbreaks

/**
 * What the "Today" widget shows: quests done, water, and streak. The app pushes a fresh copy
 * whenever any of them changes. Pure (no Android classes) so it can be tested on a plain JVM.
 */
data class ProgressSnapshot(
  val day: String,          // YYYY-MM-DD the numbers belong to
  val questsDone: Int,
  val questsTotal: Int,
  val waterMl: Int,
  val waterGoalMl: Int,
  val streak: Int,
) {
  companion object {
    val EMPTY = ProgressSnapshot("", 0, 0, 0, 0, 0)

    private val DAY = Regex("^\\d{4}-\\d{2}-\\d{2}$")

    /** Clamps anything the JavaScript side sends: no negatives, done never above total. */
    fun clean(day: String, questsDone: Int, questsTotal: Int, waterMl: Int, waterGoalMl: Int, streak: Int): ProgressSnapshot {
      val total = questsTotal.coerceIn(0, 20)
      return ProgressSnapshot(
        day = if (DAY.matches(day)) day else "",
        questsDone = questsDone.coerceIn(0, total),
        questsTotal = total,
        waterMl = waterMl.coerceIn(0, 20_000),
        waterGoalMl = waterGoalMl.coerceIn(0, 20_000),
        streak = streak.coerceIn(0, 100_000),
      )
    }

    /** 0..100 for a progress bar; an empty goal is 0, and overshoot stops at 100. */
    fun percent(part: Int, whole: Int): Int =
      if (whole <= 0) 0 else ((part.toLong() * 100) / whole).toInt().coerceIn(0, 100)
  }

  /** Numbers from an earlier day are out of date: the widget asks the person to open the app. */
  fun isFresh(today: String): Boolean = day.isNotEmpty() && day == today

  /** Litres with one decimal, e.g. 1500 -> "1.5". Avoids locale commas so the layout stays predictable. */
  fun litres(ml: Int): String = "${ml / 1000}.${(ml % 1000) / 100}"
}
