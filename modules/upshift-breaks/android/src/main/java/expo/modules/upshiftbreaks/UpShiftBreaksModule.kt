package expo.modules.upshiftbreaks

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JavaScript bridge for mindful breaks on Android. The heavy lifting happens in
 * BreakMonitorService; this just configures it, reports permission state and
 * opens the right system settings screens.
 */
class UpShiftBreaksModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UpShiftBreaks")

    Function("isSupported") { true }

    Function("hasUsageAccess") { BreakMonitorService.hasUsageAccess(context) }

    Function("canDrawOverlays") { Settings.canDrawOverlays(context) }

    Function("openUsageAccessSettings") {
      openSettings(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }

    Function("openOverlaySettings") {
      openSettings(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
    }

    Function("openBatterySettings") {
      openSettings(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    // Launchable apps only (those with a launcher icon), so we never need the
    // broad QUERY_ALL_PACKAGES permission. UpShift itself is left out.
    AsyncFunction("getInstalledApps") {
      val pm = context.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(launcher, 0)
        .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
        .filter { it.first != context.packageName }
        .distinctBy { it.first }
        .sortedBy { it.second.lowercase() }
        .map { mapOf("packageName" to it.first, "label" to it.second) }
    }

    // The whole policy as JSON (see services/breaks/native.ts), plus the apps to watch.
    Function("setPolicy") { policyJson: String, packages: List<String> ->
      BreakConfig.write(context, policyJson, packages)
      val s = BreakConfig.read(context)
      if (s.policy.enabled && packages.isNotEmpty() && BreakMonitorService.hasUsageAccess(context)) {
        BreakMonitorService.start(context)
      } else {
        BreakMonitorService.stop(context)
      }
    }

    // Numbers for the "Today" home-screen widget (quests, water, streak). Display only.
    Function("setProgressSnapshot") { day: String, questsDone: Int, questsTotal: Int, waterMl: Int, waterGoalMl: Int, streak: Int ->
      ProgressWidgetProvider.push(context, ProgressSnapshot.clean(day, questsDone, questsTotal, waterMl, waterGoalMl, streak))
    }

    Function("getConfig") {
      val s = BreakConfig.read(context)
      BreakConfig.toMap(context) + mapOf(
        "running" to (s.policy.enabled && s.packages.isNotEmpty() && BreakMonitorService.hasUsageAccess(context)),
      )
    }

    // A break launched from another app that has not been finished yet.
    Function("getPendingBreak") {
      BreakConfig.pending(context)?.let { mapOf("pkg" to it.first, "label" to it.second) }
    }

    // The exercise is done: clear the block and start a fresh interval.
    Function("markBreakDone") {
      BreakConfig.clearPending(context)
      BreakConfig.incrementCompleted(context)
      BreakMonitorService.notifyBreakDone(context)
    }

    // The break was cut short by an emergency pass: lift it WITHOUT counting it as a finished break.
    Function("abandonBreak") {
      BreakConfig.clearPending(context)
      BreakMonitorService.notifyBreakDone(context)
    }

    // "Exit": go back to the app the user was in, exactly where they left it.
    Function("returnToApp") { pkg: String ->
      val intent = context.packageManager.getLaunchIntentForPackage(pkg)
      if (intent == null) {
        false
      } else {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        context.startActivity(intent)
        true
      }
    }

    AsyncFunction("moveToBack") {
      appContext.currentActivity?.moveTaskToBack(true)
      Unit
    }.runOnQueue(Queues.MAIN)
  }

  private fun openSettings(intent: Intent) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      context.startActivity(intent)
    } catch (e: Exception) {
      // Some devices don't have the screen; fall back to the app's own settings page.
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }
}
