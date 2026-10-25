// Parity check, Kotlin side. Reads scenarios.txt (written by ts-run.ts), runs the
// Kotlin policy over them, and prints one result line per scenario in the same
// format as expected.txt. Compile together with UsageTracker.kt and BreakPolicy.kt.

import expo.modules.upshiftbreaks.*
import java.io.File

const val NOW0 = 1_000_000L
const val STEP = 2000L

data class Seg(val dur: Long, val watched: Boolean, val screen: Boolean, val switches: Int, val call: Boolean, val nav: Boolean, val work: Boolean)

fun run(policy: Policy, startDow: Int, startMod: Int, breaks0: Int, segs: List<Seg>): Pair<String, String> {
  val total = segs.sumOf { it.dur }
  val tracker = UsageTracker()
  var breaks = breaks0
  val out = mutableListOf<String>()
  val wid = mutableListOf<String>()
  var elapsed = 0L
  while (elapsed < total) {
    var acc = 0L
    var seg = segs[0]
    for (g in segs) { seg = g; if (elapsed < acc + g.dur) break; acc += g.dur }
    val totalMin = startMod + (elapsed / 60_000L).toInt()
    val local = LocalTime((startDow + totalMin / 1440) % 7, totalMin % 1440)
    val action = tracker.decide(NOW0 + elapsed, seg.watched, seg.screen, local, seg.switches, breaks, seg.call, seg.nav, seg.work, policy)
    if (elapsed % 20_000L == 0L) {
      val w = BreakPolicy.widgetState(NOW0 + elapsed, local, policy, tracker.accumulatedMs, tracker.pending, breaks, seg.switches)
      wid.add("$elapsed:${w.kind.name}:${w.minutes}")
    }
    if (action != Action.NONE) {
      out.add("$elapsed:${action.name}")
      if (action == Action.BREAK) { tracker.complete(); breaks++ }
    }
    elapsed += STEP
  }
  return Pair(out.joinToString(","), wid.joinToString(","))
}

fun main(args: Array<String>) {
  var idx = -1
  var policy: Policy? = null
  var dow = 0; var mod = 0; var b0 = 0
  var segs = mutableListOf<Seg>()
  val results = mutableListOf<String>()

  fun flush() {
    val p = policy ?: return
    val (a, w) = run(p, dow, mod, b0, segs)
    results.add("R $idx $a")
    results.add("W $idx $w")
  }

  for (line in File(args[0]).readLines()) {
    val f = line.trim().split(" ")
    when (f[0]) {
      "C" -> { flush(); idx = f[1].toInt(); segs = mutableListOf(); policy = null }
      "P" -> {
        val days = if (f[4] == "-") emptySet() else f[4].split(",").map { it.toInt() }.toSet()
        policy = Policy(
          enabled = f[1] == "1", intervalMin = f[2].toInt(),
          schedule = Schedule(f[3] == "1", days, f[5].toInt(), f[6].toInt()),
          dailyCap = f[7].toInt(), adaptive = f[8] == "1",
          windDown = WindDown(f[11] == "1", f[12].toInt(), f[13].toInt()),
          exceptions = Exceptions(f[14] == "1", f[15] == "1", f[16] == "1"),
          pausedUntil = f[9].toLong(), strictUntil = f[10].toLong(),
        )
      }
      "L" -> { dow = f[1].toInt(); mod = f[2].toInt(); b0 = f[3].toInt() }
      "G" -> segs.add(Seg(f[1].toLong(), f[2] == "1", f[3] == "1", f[4].toInt(), f[5] == "1", f[6] == "1", f[7] == "1"))
    }
  }
  flush()
  File(args[1]).writeText(results.joinToString("\n") + "\n")
}
