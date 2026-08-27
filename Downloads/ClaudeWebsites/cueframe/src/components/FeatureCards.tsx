import { motion } from "motion/react"
import { Mic, Captions, Wand2 } from "lucide-react"
import { SpotlightCard } from "./ui/SpotlightCard"

const CARDS = [
  {
    icon: Mic,
    title: "Transcription + speaker detection",
    desc: "Every upload is transcribed and its speakers identified automatically — the raw material an agent needs to actually write an edit.",
  },
  {
    icon: Captions,
    title: "Composited captions, no masking",
    desc: "Captions sit behind the speaker, composited straight from the footage. Change the copy without re-editing or re-masking anything.",
  },
  {
    icon: Wand2,
    title: "No footage? Generate from a brief",
    desc: "Skip filming entirely — give CueFrame a brief and it can produce the video from licensed stock.",
  },
]

export function FeatureCards() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">
          Design-focused editing
        </span>
        <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
          The parts of editing that don't scale, handled
        </h2>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {CARDS.map((c, i) => (
          <motion.div
            key={c.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
          >
            <SpotlightCard className="h-full">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--espresso)]">
                <c.icon className="h-5 w-5 text-[var(--accent)]" />
              </div>
              <h3 className="mb-1.5 font-semibold text-[var(--ink)]">{c.title}</h3>
              <p className="text-sm leading-relaxed text-[var(--ink-soft)]">{c.desc}</p>
            </SpotlightCard>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
