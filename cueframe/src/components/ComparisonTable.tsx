import { motion } from "motion/react"
import { Check, Minus } from "lucide-react"
import { SectionHeading } from "./ui/SectionHeading"

// Every row is a factual differentiator established elsewhere on the site —
// nothing invented, just laid out side by side.
const ROWS = [
  {
    label: "Pricing",
    traditional: "Monthly seat, whether you render or not",
    cueframe: "Pay per render — $0.50 up to a minute, no subscription",
  },
  {
    label: "Re-running an edit",
    traditional: "Re-scrub the timeline by hand, results can drift",
    cueframe: "The same composition renders byte-for-byte identical",
  },
  {
    label: "Multiple aspect ratios",
    traditional: "Re-cut manually for each platform",
    cueframe: "One edit reflows to 9:16, 1:1, and 16:9",
  },
  {
    label: "Keeping the speaker in frame",
    traditional: "Manual keyframing, shot by shot",
    cueframe: "Camera follows whoever is talking",
  },
  {
    label: "Who drives it",
    traditional: "You, inside a desktop NLE",
    cueframe: "Your agent — Claude Code, Cursor, ChatGPT, and 10+ more",
  },
  {
    label: "Exporting",
    traditional: "Locked to one app's project format",
    cueframe: "Timeline exports to Premiere Pro or Final Cut",
  },
]

export function ComparisonTable() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="Why CueFrame"
          title="Not another timeline to scrub"
          description="CueFrame replaces manual editing with a render your agent calls directly. Here is what actually changes."
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 overflow-hidden rounded-xl border border-[var(--border)]"
        >
          {/* Header only makes sense once the two columns sit side by side. */}
          <div className="hidden grid-cols-[1.1fr_1fr_1fr] border-b border-[var(--border)] bg-[var(--surface)] md:grid">
            <div className="px-6 py-3.5" />
            <div className="px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-dim)]">
              Traditional
            </div>
            <div className="px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
              CueFrame
            </div>
          </div>

          {ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`md:grid md:grid-cols-[1.1fr_1fr_1fr] ${
                i !== ROWS.length - 1 ? "border-b border-[var(--border)]" : ""
              }`}
            >
              <div className="bg-[var(--surface)] px-5 py-3 text-[13px] font-semibold text-[var(--ink)] sm:px-6 md:flex md:items-center md:bg-transparent md:py-5 md:text-[15px]">
                {row.label}
              </div>

              <div className="flex items-start gap-2.5 px-5 py-4 sm:px-6 md:py-5">
                <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-dim)]" />
                <span className="text-[14px] leading-relaxed text-[var(--ink-dim)]">
                  {row.traditional}
                </span>
              </div>

              <div className="flex items-start gap-2.5 border-t border-[var(--border)] bg-[var(--accent-wash)] px-5 py-4 sm:px-6 md:border-t-0 md:py-5">
                <Check
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
                  strokeWidth={3}
                />
                <span className="text-[14px] leading-relaxed text-[var(--ink)]">
                  {row.cueframe}
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
