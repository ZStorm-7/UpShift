import { motion } from "motion/react"
import { Check, Monitor, Download } from "lucide-react"
import { SectionHeading } from "./ui/SectionHeading"

// Folded in from the old standalone Stats section — the numbers mean more
// sitting next to the price than floating in a band of their own.
const FIGURES = [
  { value: "$0.50", label: "per render, up to a minute" },
  { value: "4K", label: "maximum output resolution" },
  { value: "10+", label: "agent tools, one command" },
  { value: "$20", label: "free credit, every account" },
]

const INCLUDED = [
  "$20 free credit to start, no card required",
  "No subscription and no seats",
  "Previews are free — checking an edit costs nothing",
  "Billed by the output minute after the first (rounded up)",
  "720p renders half price, 4K counts double",
  "Transcription costs pennies",
  "Credits don't expire",
  "Export the timeline to Premiere or Final Cut any time",
]

export function Pricing() {
  return (
    <section
      id="pricing"
      className="border-y border-[var(--border)] bg-[var(--bg-2)] py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="Pricing"
          title="Pay for what you render"
          description="No plans, no minimums, no seats. Cost tracks usage exactly."
        />

        <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] lg:grid-cols-4">
          {FIGURES.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="bg-[var(--bg-2)] px-5 py-7 text-center sm:px-6"
            >
              <p
                className="tabular text-3xl font-bold text-[var(--accent)] sm:text-4xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {f.value}
              </p>
              <p className="mt-2 text-[13px] leading-snug text-[var(--ink-dim)]">
                {f.label}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-10 max-w-lg overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[var(--surface)]"
        >
          <div className="border-b border-[var(--border)] px-8 py-9 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-dim)]">
              Starting at
            </p>
            <p
              className="tabular mt-3 text-5xl font-bold text-[var(--ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              $0.50
              <span className="ml-1 text-lg font-normal text-[var(--ink-dim)]">
                / render
              </span>
            </p>
            <p className="mt-3 text-[13px] text-[var(--ink-dim)]">
              A 3-minute cut is $1.50. Previews are free.
            </p>
          </div>

          <ul className="space-y-3.5 px-8 py-8">
            {INCLUDED.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-[14px] leading-relaxed text-[var(--ink-soft)]"
              >
                <Check
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
                  strokeWidth={3}
                />
                {item}
              </li>
            ))}
          </ul>

          <div className="px-8 pb-8">
            <a
              href="#get-started"
              className="block w-full rounded-md bg-[var(--accent)] py-3.5 text-center text-[15px] font-semibold text-[var(--accent-ink)] transition-opacity hover:opacity-90"
            >
              Claim $20 free credit
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          id="download-app"
          className="mx-auto mt-6 flex max-w-lg scroll-mt-24 flex-col items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-6 py-6 text-center sm:flex-row sm:text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--espresso)]">
            <Monitor className="h-5 w-5 text-[var(--accent)]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-[var(--ink)]">
              CueFrame desktop app
            </p>
            <p className="mt-0.5 text-[12.5px] text-[var(--ink-dim)]">
              Free local editor for macOS and Windows
            </p>
          </div>
          <a
            href="#download"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-[var(--accent-ink)] transition-transform hover:scale-[1.03]"
          >
            Download
            <Download className="h-3.5 w-3.5" />
          </a>
        </motion.div>
      </div>
    </section>
  )
}
