import { motion } from "motion/react"
import { Check } from "lucide-react"

const INCLUDED = [
  "$20 free credit to start, no card required",
  "No subscription and no seats",
  "Previews are free — checking an edit costs nothing",
  "Anything up to a minute is $0.50, billed by the output minute after (rounded up)",
  "720p renders half price, 4K counts double",
  "Transcription costs pennies",
  "Credits don't expire",
  "Export the timeline to Premiere or Final Cut any time",
]

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-28">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">
          Pricing
        </span>
        <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
          Pay for what you render
        </h2>
        <p className="mt-4 text-balance text-[var(--ink-soft)]">
          No plans, no minimums. CueFrame bills per render, so cost tracks usage exactly.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="mx-auto mt-14 max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_20px_60px_-20px_var(--shadow-tint)]"
      >
        <div className="bg-[var(--espresso)] px-8 py-8 text-center">
          <p className="text-sm font-medium text-[var(--accent-soft)]">Starting at</p>
          <p className="mt-1 text-5xl font-semibold text-white">
            $0.50<span className="text-lg font-normal text-white/60"> / render</span>
          </p>
          <p className="mt-2 text-xs text-white/50">
            up to a minute · a 3-minute cut is $1.50 · previews free
          </p>
        </div>
        <ul className="space-y-3 px-8 py-8">
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-[var(--ink-soft)]">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={3} />
              {item}
            </li>
          ))}
        </ul>
        <div className="px-8 pb-8">
          <a
            href="#get-started"
            className="block w-full rounded-lg bg-[var(--accent)] py-3 text-center text-sm font-semibold text-[var(--espresso)] transition-transform hover:scale-[1.02]"
          >
            Claim $20 free credit
          </a>
        </div>
      </motion.div>
    </section>
  )
}
