package expo.modules.upshiftbreaks

import android.content.Context

/**
 * Everything the background service needs, kept in SharedPreferences so it
 * works when the app's JavaScript is not running (after a reboot, or when the
 * user is in another app). Nothing here ever leaves the device.
 */
data class BreakSettings(
  val enabled: Boolean,
  val intervalMinutes: Int,
  val packages: Set<String>,
)

object BreakConfig {
  private const val PREFS = "upshift_mindful_breaks"
  private const val K_ENABLED = "enabled"
  private const val K_INTERVAL = "intervalMinutes"
  private const val K_PACKAGES = "packages"
  private const val K_PENDING_PKG = "pendingPkg"
  private const val K_PENDING_LABEL = "pendingLabel"
  private const val K_ACCUMULATED = "accumulatedMs"

  const val DEFAULT_INTERVAL_MIN = 30
  const val MIN_INTERVAL_MIN = 5
  const val MAX_INTERVAL_MIN = 180

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun clampInterval(v: Int): Int =
    if (v <= 0) DEFAULT_INTERVAL_MIN else v.coerceIn(MIN_INTERVAL_MIN, MAX_INTERVAL_MIN)

  fun read(ctx: Context): BreakSettings {
    val p = prefs(ctx)
    return BreakSettings(
      enabled = p.getBoolean(K_ENABLED, false),
      intervalMinutes = clampInterval(p.getInt(K_INTERVAL, DEFAULT_INTERVAL_MIN)),
      packages = p.getStringSet(K_PACKAGES, emptySet())?.toSet() ?: emptySet(),
    )
  }

  fun write(ctx: Context, enabled: Boolean, intervalMinutes: Int, packages: Collection<String>) {
    prefs(ctx).edit()
      .putBoolean(K_ENABLED, enabled)
      .putInt(K_INTERVAL, clampInterval(intervalMinutes))
      .putStringSet(K_PACKAGES, packages.toSet())
      .apply()
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
}
