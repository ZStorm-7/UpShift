package expo.modules.upshiftbreaks

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * Everything the background service needs, kept in SharedPreferences so it works
 * when the app's JavaScript is not running (after a reboot, or when the user is
 * in another app). Nothing here ever leaves the device.
 */
data class BreakSettings(val policy: Policy, val packages: Set<String>)

object BreakConfig {
  private const val PREFS = "upshift_mindful_breaks"
  private const val K_POLICY = "policyJson"
  private const val K_PACKAGES = "packages"
  private const val K_PENDING_PKG = "pendingPkg"
  private const val K_PENDING_LABEL = "pendingLabel"
  private const val K_ACCUMULATED = "accumulatedMs"
  private const val K_WIDGET_KIND = "widgetKind"
  private const val K_WIDGET_MIN = "widgetMinutes"
  private const val K_DONE_DAY = "doneDay"
  private const val K_DONE_COUNT = "doneCount"

  const val DEFAULT_INTERVAL_MIN = 30
  const val MIN_INTERVAL_MIN = 5
  const val MAX_INTERVAL_MIN = 180

  val DISABLED = Policy(
    enabled = false, intervalMin = DEFAULT_INTERVAL_MIN,
    schedule = Schedule(false, setOf(1, 2, 3, 4, 5), 9 * 60, 17 * 60),
    dailyCap = 0, adaptive = false,
    windDown = WindDown(false, 22 * 60, 6 * 60),
    exceptions = Exceptions(calls = true, navigation = true, workouts = true),
    pausedUntil = 0L, strictUntil = 0L,
  )

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun clampInterval(v: Int): Int =
    if (v <= 0) DEFAULT_INTERVAL_MIN else v.coerceIn(MIN_INTERVAL_MIN, MAX_INTERVAL_MIN)

  /** Parses the policy the JavaScript side sends (see services/breaks/native.ts). */
  fun parsePolicy(json: String): Policy {
    val o = JSONObject(json)
    val s = o.optJSONObject("schedule")
    val w = o.optJSONObject("windDown")
    val x = o.optJSONObject("exceptions")
    val days = mutableSetOf<Int>()
    s?.optJSONArray("days")?.let { arr -> for (i in 0 until arr.length()) days.add(arr.getInt(i)) }
    return Policy(
      enabled = o.optBoolean("enabled", false),
      intervalMin = clampInterval(o.optInt("intervalMin", DEFAULT_INTERVAL_MIN)),
      schedule = Schedule(
        enabled = s?.optBoolean("enabled", false) ?: false,
        days = days,
        startMin = s?.optInt("startMin", 9 * 60) ?: 9 * 60,
        endMin = s?.optInt("endMin", 17 * 60) ?: 17 * 60,
      ),
      dailyCap = o.optInt("dailyCap", 0).coerceAtLeast(0),
      adaptive = o.optBoolean("adaptive", false),
      windDown = WindDown(
        enabled = w?.optBoolean("enabled", false) ?: false,
        startMin = w?.optInt("startMin", 22 * 60) ?: 22 * 60,
        endMin = w?.optInt("endMin", 6 * 60) ?: 6 * 60,
      ),
      exceptions = Exceptions(
        calls = x?.optBoolean("calls", true) ?: true,
        navigation = x?.optBoolean("navigation", true) ?: true,
        workouts = x?.optBoolean("workouts", true) ?: true,
      ),
      pausedUntil = o.optLong("pausedUntil", 0L),
      strictUntil = o.optLong("strictUntil", 0L),
    )
  }

  fun read(ctx: Context): BreakSettings {
    val p = prefs(ctx)
    val policy = try {
      p.getString(K_POLICY, null)?.let { parsePolicy(it) } ?: DISABLED
    } catch (e: Exception) {
      DISABLED
    }
    return BreakSettings(policy, p.getStringSet(K_PACKAGES, emptySet())?.toSet() ?: emptySet())
  }

  fun write(ctx: Context, policyJson: String, packages: Collection<String>) {
    parsePolicy(policyJson) // reject malformed input before storing it
    prefs(ctx).edit().putString(K_POLICY, policyJson).putStringSet(K_PACKAGES, packages.toSet()).apply()
  }

  fun toMap(ctx: Context): Map<String, Any> {
    val s = read(ctx)
    return mapOf(
      "enabled" to s.policy.enabled,
      "intervalMinutes" to s.policy.intervalMin,
      "packages" to s.packages.toList(),
      "completedToday" to completedToday(ctx),
    )
  }

  // A break that was launched but not finished. It survives process death, which
  // is what keeps the break mandatory.
  fun setPending(ctx: Context, pkg: String, label: String) {
    prefs(ctx).edit().putString(K_PENDING_PKG, pkg).putString(K_PENDING_LABEL, label).apply()
  }

  fun pending(ctx: Context): Pair<String, String>? {
    val p = prefs(ctx)
    val pkg = p.getString(K_PENDING_PKG, null) ?: return null
    return Pair(pkg, p.getString(K_PENDING_LABEL, pkg) ?: pkg)
  }

  fun clearPending(ctx: Context) {
    prefs(ctx).edit().remove(K_PENDING_PKG).remove(K_PENDING_LABEL).putLong(K_ACCUMULATED, 0L).apply()
  }

  fun readAccumulated(ctx: Context): Long = prefs(ctx).getLong(K_ACCUMULATED, 0L)
  fun writeAccumulated(ctx: Context, ms: Long) { prefs(ctx).edit().putLong(K_ACCUMULATED, ms).apply() }

  // Breaks finished today (for the daily cap). Resets with the calendar day.
  private fun todayKey(): String {
    val c = Calendar.getInstance()
    return "${c.get(Calendar.YEAR)}-${c.get(Calendar.DAY_OF_YEAR)}"
  }

  fun completedToday(ctx: Context): Int {
    val p = prefs(ctx)
    return if (p.getString(K_DONE_DAY, null) == todayKey()) p.getInt(K_DONE_COUNT, 0) else 0
  }

  fun incrementCompleted(ctx: Context) {
    val n = completedToday(ctx) + 1
    prefs(ctx).edit().putString(K_DONE_DAY, todayKey()).putInt(K_DONE_COUNT, n).apply()
  }

  // The last state shown on the home-screen widget.
  fun writeWidget(ctx: Context, s: WidgetState) {
    prefs(ctx).edit().putString(K_WIDGET_KIND, s.kind.name).putInt(K_WIDGET_MIN, s.minutes).apply()
  }

  fun readWidget(ctx: Context): WidgetState {
    val p = prefs(ctx)
    val kind = try { WidgetKind.valueOf(p.getString(K_WIDGET_KIND, WidgetKind.OFF.name) ?: WidgetKind.OFF.name) } catch (e: Exception) { WidgetKind.OFF }
    return WidgetState(kind, p.getInt(K_WIDGET_MIN, 0))
  }
}
