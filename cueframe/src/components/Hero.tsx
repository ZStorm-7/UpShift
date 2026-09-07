import { motion } from "motion/react"
import { ArrowRight, Download } from "lucide-react"
import { ChromaText } from "./ui/ChromaText"
import { Showcase } from "./Showcase"

interface HeroProps {
  /** Gates the entrance so the reveal plays where the visitor can see it. */
  ready: boolean
}

const rise = {
  initial: { opacity: 0, y: 14 },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
}

export function Hero({ ready }: HeroProps) {
  return (
    <section className="relative overflow-hidden py-14 sm:py-20">
      <div className="field pointer-events-none absolute inset-0 -z-20" />
      <div className="grid-rule pointer-events-none absolute inset-0 -z-10 opacity-[0.55]" />

      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-8">
          {/* left: the argument */}
          <div>
            <motion.div
              {...rise}
              animate={ready ? { opacity: 1, y: 0 } : {}}
              className="flex w-fit items-center gap-2.5 rounded-full border border-[var(--border-bright)] bg-[var(--surface)]/70 px-3.5 py-1.5 backdrop-blur"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse-dot" />
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                A render your agent can call
              </span>
            </motion.div>

            <motion.div
              {...rise}
              animate={ready ? { opacity: 1, y: 0 } : {}}
              transition={{ ...rise.transition, delay: 0.06 }}
              className="mt-6"
            >
              <h1 className="text-[var(--ink)]">
                <ChromaText delay={140} className="block">
                  Describe the cut.
                </ChromaText>
                <ChromaText
                  delay={420}
                  className="mt-1 block text-[var(--accent)]"
                >
                  Get the frame back.
                </ChromaText>
              </h1>
            </motion.div>

            <motion.p
              {...rise}
              animate={ready ? { opacity: 1, y: 0 } : {}}
              transition={{ ...rise.transition, delay: 0.12 }}
              className="measure mt-6 text-[17px] leading-relaxed text-[var(--ink-soft)] sm:text-lg"
            >
              CueFrame is a video editing API for AI agents. Your agent writes
              the edit as data — CueFrame renders it, and renders it the same
              way every time after that.
            </motion.p>

            <motion.div
              {...rise}
              animate={ready ? { opacity: 1, y: 0 } : {}}
              transition={{ ...rise.transition, delay: 0.18 }}
              className="mt-8 flex flex-col items-start gap-3 sm:flex-row"
              id="download"
            >
              <a
                href="#get-started"
                className="group flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-6 py-3.5 text-[15px] font-semibold text-[var(--accent-ink)] transition-opacity hover:opacity-90 sm:w-auto"
              >
                Start building
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#download-app"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border-bright)] bg-[var(--surface)]/60 px-6 py-3.5 text-[15px] font-medium text-[var(--ink)] backdrop-blur transition-colors hover:border-[var(--ink-dim)] sm:w-auto"
              >
                <Download className="h-4 w-4" />
                Download free — macOS & Windows
              </a>
            </motion.div>

            <motion.p
              {...rise}
              animate={ready ? { opacity: 1, y: 0 } : {}}
              transition={{ ...rise.transition, delay: 0.24 }}
              className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)]"
            >
              Free local editor · $20 agent credit · no card
            </motion.p>
          </div>

          {/* right: the render itself — the strongest argument on the page,
              sitting beside the thesis instead of stacked under it */}
          <Showcase />
        </div>
      </div>
    </section>
  )
}
