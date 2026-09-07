import { motion } from "motion/react"
import { SectionHeading } from "./ui/SectionHeading"
import { TerminalDemo } from "./TerminalDemo"
import { Marquee } from "./ui/Marquee"

// This is one of the few places on the page where numbering is honest: the
// three steps genuinely happen in order, so the markers carry information
// rather than decoration.
const STEPS = [
  {
    step: "01",
    title: "Upload",
    desc: "Send raw footage — an interview, b-roll, a screen recording. No pre-editing required.",
  },
  {
    step: "02",
    title: "Compose",
    desc: "Your agent describes the edit in plain language or as structured data: pacing, framing, formats, brand.",
  },
  {
    step: "03",
    title: "Render",
    desc: "CueFrame returns the finished video in every format you asked for — reproducible byte-for-byte next time.",
  },
]

// Every line maps to a real CueFrame capability — nothing aspirational.
const PROMPTS = [
  "Cut the intro to 5 seconds",
  "Follow the speaker, keep them centered",
  "Export as 9:16, 1:1, and 16:9",
  "Add composited captions in the brand color",
  "Transcribe this and pull the best 30 seconds",
  "Render a 720p preview before the final pass",
  "No footage yet — generate this from a brief",
  "Re-render at 4K for the client cut",
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="How it works"
          title="Footage in, finished cut out"
        />

        {/* left: the argument (steps) — right: the proof (a real terminal) */}
        <div className="mt-12 grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-8">
          <div className="space-y-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: i * 0.09, ease: [0.16, 1, 0.3, 1] }}
                className="group relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-5 transition-colors hover:bg-[var(--surface)] sm:p-6"
              >
                <span className="absolute inset-x-0 top-0 h-px scale-x-0 bg-[var(--accent)] transition-transform duration-500 group-hover:scale-x-100" />
                <div className="flex items-baseline gap-3">
                  <span className="tabular text-[13px] font-medium text-[var(--chroma-r)]">
                    {s.step}
                  </span>
                  <h3 className="text-[var(--ink)]">{s.title}</h3>
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
                  {s.desc}
                </p>
              </motion.div>
            ))}

            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="pt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-dim)]"
            >
              Works with the agent you already use
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <TerminalDemo />
          </motion.div>
        </div>

        <div className="relative mt-10">
          <Marquee className="[--gap:1rem]">
            {PROMPTS.map((p) => (
              <span
                key={p}
                className="whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-[13px] text-[var(--ink-soft)]"
              >
                <span className="mr-2 text-[var(--chroma-r)]">›</span>
                {p}
              </span>
            ))}
          </Marquee>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[var(--bg-1)] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-[var(--bg-1)] to-transparent" />
        </div>
      </div>
    </section>
  )
}
