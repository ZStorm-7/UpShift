import { motion } from "motion/react"
import { Scissors, Mic, Megaphone, FileCode2 } from "lucide-react"

// Framed as capability-driven categories, not fabricated customer stories —
// each one maps directly to a real CueFrame feature already covered
// elsewhere on the page (multi-format, transcription, edit-as-data).
const CASES = [
  {
    icon: Scissors,
    title: "Social clips from long-form",
    description:
      "Point an agent at a full recording and get 9:16, 1:1, and 16:9 cuts back, camera auto-framed on whoever's talking.",
  },
  {
    icon: Mic,
    title: "Podcast highlight reels",
    description:
      `"Transcribe this and pull the best 30 seconds" — CueFrame finds the moment, your agent renders it.`,
  },
  {
    icon: Megaphone,
    title: "Ad variations, fast",
    description:
      "Same composition, new caption color or format — a re-render, not a re-edit, so testing variants costs seconds.",
  },
  {
    icon: FileCode2,
    title: "Docs and product demos",
    description:
      "Tweak one line in the edit after a UI change and re-render byte-identical — nothing else in the cut moves.",
  },
]

export function UseCases() {
  return (
    <section className="bg-[var(--bg-2)]/55 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">
            Built for
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
            Whatever your agent needs to ship
          </h2>
          <p className="mt-4 text-balance text-[var(--ink-soft)]">
            The same four primitives — compose, transcribe, reflow, render —
            cover most of what teams actually ask an editing API to do.
          </p>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CASES.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--espresso)] text-[color:var(--accent)]">
                <c.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold text-[var(--ink)]">{c.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">
                  {c.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
