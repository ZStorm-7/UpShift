import { motion } from "motion/react"
import { Check, X } from "lucide-react"

// Every row is a real, factual differentiator already established elsewhere
// on the site (pricing, edit-as-data, multi-format, agent-native) — nothing
// invented here, just laid out side by side for a direct comparison.
const ROWS = [
  {
    label: "Pricing",
    traditional: "Monthly seat, whether you render or not",
    cueframe: "Pay per render — $0.50 up to a minute, no subscription",
  },
  {
    label: "Re-running an edit",
    traditional: "Re-scrub the timeline by hand, results can drift",
    cueframe: "Same composition renders byte-for-byte identical, every time",
  },
  {
    label: "Multiple aspect ratios",
    traditional: "Re-cut manually for each platform",
    cueframe: "One edit reflows to 9:16, 1:1, 16:9 automatically",
  },
  {
    label: "Keeping the speaker in frame",
    traditional: "Manual keyframing, shot by shot",
    cueframe: "Camera dynamically follows whoever's talking",
  },
  {
    label: "Who drives it",
    traditional: "You, inside a desktop NLE",
    cueframe: "Your agent — Claude Code, Cursor, ChatGPT, and 10+ more",
  },
  {
    label: "Exporting",
    traditional: "Locked to one app's project format",
    cueframe: "Timeline exports to Premiere Pro or Final Cut any time",
  },
]

export function ComparisonTable() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 sm:py-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-2xl text-center"
      >
        <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">
          Why CueFrame
        </span>
        <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
          Not another timeline to scrub
        </h2>
        <p className="mt-4 text-balance text-[var(--ink-soft)]">
          CueFrame replaces manual editing with a render your agent can call
          directly — here's what actually changes.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="mt-14 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_20px_60px_-20px_var(--shadow-tint)]"
      >
        {/* header row */}
        <div className="grid grid-cols-[1fr_1.1fr_1.1fr] border-b border-[var(--border)] bg-[var(--bg-2)]/60">
          <div className="px-4 py-3 sm:px-6" />
          <div className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)] sm:px-6">
            Traditional editing
          </div>
          <div className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--accent-ink)] sm:px-6">
            <span className="rounded-md bg-[var(--accent)] px-2 py-1">CueFrame</span>
          </div>
        </div>

        {ROWS.map((row, i) => (
          <div
            key={row.label}
            className={`grid grid-cols-[1fr_1.1fr_1.1fr] ${
              i !== ROWS.length - 1 ? "border-b border-[var(--border)]" : ""
            }`}
          >
            <div className="flex items-center px-4 py-4 text-sm font-medium text-[var(--ink)] sm:px-6">
              {row.label}
            </div>
            <div className="flex items-start gap-2 px-4 py-4 text-sm text-[var(--ink-soft)] sm:px-6">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-soft)]/50" strokeWidth={2.5} />
              <span>{row.traditional}</span>
            </div>
            <div className="flex items-start gap-2 bg-[var(--accent-soft)]/10 px-4 py-4 text-sm text-[var(--ink)] sm:px-6">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" strokeWidth={3} />
              <span>{row.cueframe}</span>
            </div>
          </div>
        ))}
      </motion.div>
    </section>
  )
}
