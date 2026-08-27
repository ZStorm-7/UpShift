import { motion } from "motion/react"
import { ArrowRight, Sparkles, Apple } from "lucide-react"
import { EditorMock } from "./EditorMock"
import { DownloadButton } from "./DownloadButton"
import { GlitchText } from "./ui/GlitchText"

interface HeroProps {
  /** Gates every entrance animation below — pass true once the intro
   * loader has fully faded, so the reveal actually plays where the visitor
   * can see it instead of finishing silently underneath the overlay. */
  ready: boolean
}

export function Hero({ ready }: HeroProps) {
  return (
    <section className="relative overflow-hidden pb-8 pt-20 sm:pt-28">
      {/* espresso -> yellow gradient mesh backdrop, most visible in dark mode */}
      <div className="bg-mesh pointer-events-none absolute inset-0 -z-10" />

      {/* start: headline + copy, centered */}
      <div className="mx-auto max-w-3xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={ready ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mx-auto mb-6 flex w-fit items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)]/70 px-3.5 py-1.5 text-xs font-medium text-[var(--ink-soft)] shadow-sm backdrop-blur"
        >
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
          A render your agent can call directly
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={ready ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="text-balance text-5xl font-bold leading-[1.05] tracking-tight text-[var(--ink)] sm:text-6xl"
        >
          <GlitchText text="Turn rough footage into" trigger={ready} delay={150} duration={650} />{" "}
          <GlitchText
            text="finished video"
            trigger={ready}
            delay={550}
            duration={550}
            className="bg-gradient-to-r from-[#f4c430] via-[#ffd966] to-[#f4c430] bg-clip-text text-transparent animate-shimmer"
          />
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={ready ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mx-auto mt-5 max-w-xl text-balance text-lg text-[var(--ink-soft)]"
        >
          CueFrame is a video editing API for AI agents. Describe the edit, your
          agent writes it as data, CueFrame renders it — the same way, every time.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={ready ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <a
            href="#get-started"
            className="group flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--accent-ink)] shadow-lg shadow-[#f4c430]/30 transition-transform hover:scale-[1.03]"
          >
            Start building
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="https://app.cueframe.ai"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/70 px-5 py-3 text-sm font-medium text-[var(--ink)] backdrop-blur transition-colors hover:bg-[var(--surface)]"
          >
            Open in browser
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={ready ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-5 flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--ink-soft)]"
        >
          <Apple className="h-3.5 w-3.5" />
          The CueFrame desktop app is on macOS now, Windows coming soon
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={ready ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-4" id="download"
        >
          <DownloadButton compact />
        </motion.div>
      </div>

      {/* below the start: the full editor, media panel populates as it scrolls into view */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto mt-16 max-w-6xl px-6"
      >
        <EditorMock />
      </motion.div>
    </section>
  )
}
