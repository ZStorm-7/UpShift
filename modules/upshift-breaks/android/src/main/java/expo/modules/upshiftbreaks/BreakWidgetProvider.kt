package expo.modules.upshiftbreaks

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews

/**
 * The home-screen widget: how long until the next mindful break (or why there
 * isn't one). It only DISPLAYS the state the background service computes with
 * BreakPolicy.widgetState, so it can never disagree with when a break fires.
 */
class BreakWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val state = BreakConfig.readWidget(context)
    for (id in ids) manager.updateAppWidget(id, render(context, state))
  }

  companion object {
    private fun minutesText(context: Context, minutes: Int): String =
      if (minutes >= 60) context.getString(R.string.upshift_widget_hours_minutes, minutes / 60, minutes % 60)
      else context.getString(R.string.upshift_widget_minutes, minutes)

    fun render(context: Context, state: WidgetState): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.upshift_break_widget)
      val (value, sub) = when (state.kind) {
        WidgetKind.COUNTDOWN ->
          (if (state.minutes <= 0) context.getString(R.string.upshift_widget_soon) else minutesText(context, state.minutes)) to
            context.getString(R.string.upshift_widget_countdown_sub)
        WidgetKind.STRICT -> context.getString(R.string.upshift_widget_strict) to
          context.getString(R.string.upshift_widget_left, state.minutes)
        WidgetKind.PAUSED -> context.getString(R.string.upshift_widget_paused) to
          context.getString(R.string.upshift_widget_left, state.minutes)
        WidgetKind.OUTSIDE -> context.getString(R.string.upshift_widget_outside) to ""
        WidgetKind.DONE -> context.getString(R.string.upshift_widget_done) to ""
        WidgetKind.OFF -> context.getString(R.string.upshift_widget_off) to ""
      }
      views.setTextViewText(R.id.upshift_widget_value, value)
      views.setTextViewText(R.id.upshift_widget_sub, sub)

      // Tapping the widget opens UpShift.
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
        val pi = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        views.setOnClickPendingIntent(R.id.upshift_widget_root, pi)
      }
      return views
    }

    /** Stores the new state and redraws every placed widget. Cheap when none are placed. */
    fun push(context: Context, state: WidgetState) {
      BreakConfig.writeWidget(context, state)
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, BreakWidgetProvider::class.java))
      for (id in ids) manager.updateAppWidget(id, render(context, state))
    }
  }
}
