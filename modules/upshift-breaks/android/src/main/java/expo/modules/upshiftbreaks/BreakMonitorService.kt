package expo.modules.upshiftbreaks

import android.app.AppOpsManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.util.Log

/**
 * Foreground service that notices which app is in front and, after the user's
 * chosen amount of active use in the apps they selected, brings UpShift to the
 * front with the breathing break. Foreground-app detection uses UsageStatsManager
 * (the user grants "Usage access" in Settings). No Accessibility service is used
 * and nothing is uploaded: package names stay on this device.
 */
class BreakMonitorService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var settings: BreakSettings = BreakSettings(false, BreakConfig.DEFAULT_INTERVAL_MIN, emptySet())
  private var tracker: UsageTracker = UsageTracker(BreakConfig.DEFAULT_INTERVAL_MIN * 60_000L)
  private var foregroundPackage: String? = null
  private var lastEventQuery = 0L
  private var lastPersistedAt = 0L
  private var running = false

  private val tick = object : Runnable {
    override fun run() {
      try {
        onTick()
      } catch (t: Throwable) {
        Log.w(TAG, "tick failed", t)
      }
      handler.postDelayed(this, TICK_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // The app told us the user finished the exercise.
    if (intent?.action == ACTION_BREAK_DONE) {
      if (!running) {
        stopSelf()
        return START_NOT_STICKY
      }
      tracker.complete()
      return START_STICKY
    }

    // Started with startForegroundService(), so Android requires startForeground()
    // within seconds on EVERY path, including the ones that then stop.
    settings = BreakConfig.read(this)
    createChannels()
    val notification = buildOngoingNotification()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIF_ONGOING, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIF_ONGOING, notification)
    }

    if (!settings.enabled || settings.packages.isEmpty() || !hasUsageAccess(this)) {
      running = false
      handler.removeCallbacks(tick)
      stopForegroundCompat()
      stopSelf()
      return START_NOT_STICKY
    }

    // Rebuild the tracker, keeping any progress and any unfinished break.
    val previous = tracker
    tracker = UsageTracker(
      settings.intervalMinutes * 60_000L,
      accumulatedMs = if (previous.accumulatedMs > 0) previous.accumulatedMs else BreakConfig.readAccumulated(this),
      pending = BreakConfig.pending(this) != null,
    )
    running = true
    handler.removeCallbacks(tick)
    handler.post(tick)
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    handler.removeCallbacks(tick)
    BreakConfig.writeAccumulated(this, tracker.accumulatedMs)
    super.onDestroy()
  }

  private fun onTick() {
    val now = System.currentTimeMillis()
    updateForegroundPackage(now)

    val fg = foregroundPackage
    val watched = fg != null && settings.packages.contains(fg)
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager

    // Keep the tracker in step with what the app tells us through shared prefs.
    if (tracker.pending && BreakConfig.pending(this) == null) tracker.complete()

    if (tracker.step(now, watched, power.isInteractive) && fg != null) {
      launchBreak(fg)
    }

    // Persist progress at most once a minute so a reboot doesn't lose it.
    if (now - lastPersistedAt > 60_000L) {
      BreakConfig.writeAccumulated(this, tracker.accumulatedMs)
      lastPersistedAt = now
    }
  }

  /** Replays usage events since the last check to learn which app is in front. */
  @Suppress("DEPRECATION")
  private fun updateForegroundPackage(now: Long) {
    val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val from = if (lastEventQuery == 0L) now - 10 * 60_000L else lastEventQuery - 1_000L
    val events = usm.queryEvents(from, now) ?: return
    val e = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      when (e.eventType) {
        UsageEvents.Event.MOVE_TO_FOREGROUND -> foregroundPackage = e.packageName
        UsageEvents.Event.MOVE_TO_BACKGROUND -> if (e.packageName == foregroundPackage) foregroundPackage = null
      }
    }
    lastEventQuery = now
  }

  private fun labelFor(pkg: String): String = try {
    val info = packageManager.getApplicationInfo(pkg, 0)
    packageManager.getApplicationLabel(info).toString()
  } catch (e: Exception) {
    pkg
  }

  private fun launchBreak(pkg: String) {
    val label = labelFor(pkg)
    BreakConfig.setPending(this, pkg, label)
    val uri = Uri.parse("upshift://break?pkg=${Uri.encode(pkg)}&label=${Uri.encode(label)}")
    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    // With "Display over other apps" granted, Android lets a background service
    // start an activity, which is what makes the break a hard stop. Without it
    // the best we can do is a full-screen notification the user taps.
    if (Settings.canDrawOverlays(this)) {
      try {
        startActivity(intent)
        return
      } catch (t: Throwable) {
        Log.w(TAG, "direct launch failed, falling back to notification", t)
      }
    }
    postBreakNotification(intent, label)
  }

  private fun postBreakNotification(intent: Intent, label: String) {
    val pi = PendingIntent.getActivity(this, 1, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val n = notificationBuilder(CHANNEL_ALERT)
      .setContentTitle("Time for a 15-second breathing break")
      .setContentText("You've been in $label for a while. Tap to start.")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentIntent(pi)
      .setFullScreenIntent(pi, true)
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_REMINDER)
      .build()
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_BREAK, n)
  }

  private fun buildOngoingNotification(): Notification =
    notificationBuilder(CHANNEL_ONGOING)
      .setContentTitle("Mindful breaks are on")
      .setContentText("UpShift will remind you to breathe after ${settings.intervalMinutes} minutes in your chosen apps.")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setOngoing(true)
      .setPriority(Notification.PRIORITY_LOW)
      .build()

  @Suppress("DEPRECATION")
  private fun notificationBuilder(channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, channel)
    else Notification.Builder(this)

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.createNotificationChannel(NotificationChannel(CHANNEL_ONGOING, "Mindful breaks running", NotificationManager.IMPORTANCE_LOW))
    nm.createNotificationChannel(NotificationChannel(CHANNEL_ALERT, "Breathing break reminders", NotificationManager.IMPORTANCE_HIGH))
  }

  @Suppress("DEPRECATION")
  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else stopForeground(true)
  }

  companion object {
    private const val TAG = "UpShiftBreaks"
    const val ACTION_BREAK_DONE = "expo.modules.upshiftbreaks.ACTION_BREAK_DONE"
    private const val TICK_MS = 2_000L
    private const val CHANNEL_ONGOING = "upshift_breaks_ongoing"
    private const val CHANNEL_ALERT = "upshift_breaks_alert"
    private const val NOTIF_ONGOING = 4101
    private const val NOTIF_BREAK = 4102

    @Suppress("DEPRECATION")
    fun hasUsageAccess(ctx: Context): Boolean {
      val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = if (Build.VERSION.SDK_INT >= 29) {
        ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
      } else {
        ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
      }
      return mode == AppOpsManager.MODE_ALLOWED
    }

    /** Starts (or re-reads the config of) the service. Call while the app is in the foreground. */
    fun start(ctx: Context) {
      val intent = Intent(ctx, BreakMonitorService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
    }

    fun stop(ctx: Context) {
      ctx.stopService(Intent(ctx, BreakMonitorService::class.java))
    }

    fun notifyBreakDone(ctx: Context) {
      if (!BreakConfig.read(ctx).enabled) return
      try {
        ctx.startService(Intent(ctx, BreakMonitorService::class.java).setAction(ACTION_BREAK_DONE))
      } catch (t: Throwable) {
        Log.w(TAG, "could not tell the service the break finished", t)
      }
    }
  }
}
