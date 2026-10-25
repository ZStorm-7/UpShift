package expo.modules.upshiftbreaks

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Restarts the monitor after a reboot if the user had mindful breaks turned on. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    val settings = BreakConfig.read(context)
    if (!settings.enabled || settings.packages.isEmpty()) return
    try {
      BreakMonitorService.start(context)
    } catch (t: Throwable) {
      // Some devices refuse to start a foreground service from boot. The app starts it on next open.
      Log.w("UpShiftBreaks", "could not start monitor at boot", t)
    }
  }
}
