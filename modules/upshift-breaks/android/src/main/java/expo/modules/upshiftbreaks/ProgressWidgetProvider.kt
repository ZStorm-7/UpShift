package expo.modules.upshiftbreaks

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import java.util.Calendar

/**
 * The "Today" home-screen widget: quests, water and streak. It only displays what the app last
 * pushed (see ProgressSnapshot); it never reads accounts or the network.
 */
class ProgressWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val snap = read(context)
    for (id in ids) manager.updateAppWidget(id, render(context, snap))
  }

  companion object {
    private const val PREFS = "upshift_progress_widget"

    // Matches the app's quest day (firebase/quests.ts getQuestCycleKey): the day rolls over at noon.
    private fun today(): String {
      val c = Calendar.getInstance()
      if (c.get(Calendar.HOUR_OF_DAY) < 12) c.add(Calendar.DAY_OF_MONTH, -1)
      return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }

    fun read(ctx: Context): ProgressSnapshot {
      val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      return ProgressSnapshot.clean(
        p.getString("day", "") ?: "", p.getInt("qd", 0), p.getInt("qt", 0), p.getInt("wm", 0), p.getInt("wg", 0), p.getInt("st", 0),
      )
    }

    fun render(context: Context, s: ProgressSnapshot): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.upshift_progress_widget)
      val fresh = s.isFresh(today())
      if (!fresh) {
        views.setTextViewText(R.id.upshift_progress_quests, "–")
        views.setTextViewText(R.id.upshift_progress_water, "–")
        views.setTextViewText(R.id.upshift_progress_streak, "–")
        views.setProgressBar(R.id.upshift_progress_quests_bar, 100, 0, false)
        views.setProgressBar(R.id.upshift_progress_water_bar, 100, 0, false)
        views.setTextViewText(R.id.upshift_progress_note, context.getString(R.string.upshift_progress_stale))
      } else {
        views.setTextViewText(R.id.upshift_progress_quests, "${s.questsDone}/${s.questsTotal}")
        views.setTextViewText(
          R.id.upshift_progress_water,
          if (s.waterGoalMl > 0) context.getString(R.string.upshift_progress_water_value, s.litres(s.waterMl), s.litres(s.waterGoalMl)) else s.litres(s.waterMl) + " L",
        )
        views.setTextViewText(
          R.id.upshift_progress_streak,
          if (s.streak > 0) context.resources.getQuantityString(R.plurals.upshift_progress_days, s.streak, s.streak) else "–",
        )
        views.setProgressBar(R.id.upshift_progress_quests_bar, 100, ProgressSnapshot.percent(s.questsDone, s.questsTotal), false)
        views.setProgressBar(R.id.upshift_progress_water_bar, 100, ProgressSnapshot.percent(s.waterMl, s.waterGoalMl), false)
        views.setTextViewText(R.id.upshift_progress_note, "")
      }
      // Tapping the widget opens UpShift.
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
        val pi = PendingIntent.getActivity(context, 1, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        views.setOnClickPendingIntent(R.id.upshift_progress_root, pi)
      }
      return views
    }

    /** Stores the numbers and redraws every placed widget. Cheap when none are placed. */
    fun push(context: Context, snap: ProgressSnapshot) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString("day", snap.day).putInt("qd", snap.questsDone).putInt("qt", snap.questsTotal)
        .putInt("wm", snap.waterMl).putInt("wg", snap.waterGoalMl).putInt("st", snap.streak).apply()
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, ProgressWidgetProvider::class.java))
      for (id in ids) manager.updateAppWidget(id, render(context, snap))
    }
  }
}
