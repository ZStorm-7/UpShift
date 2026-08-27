import { motion } from "motion/react"
import { UploadCloud, Wand2, Clapperboard } from "lucide-react"

const STEPS = [
  {
    icon: UploadCloud,
    step: "01",
    title: "Upload",
    desc: "Send raw footage to CueFrame — an interview, b-roll, a screen recording. No pre-editing required.",
  },
  {
    icon: Wand2,
    step: "02",
    title: "Compose",
    desc: "Your agent describes the edit in plain language or as structured data: pacing, framing, formats, brand.",
  },
  {
    icon: Clapperboard,
    step: "03",
    title: "Render",
    desc: "CueFrame renders the finished video — every format you asked for, byte-for-byte reproducible next time.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-[var(--bg-2)]/55 py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">
            How it works
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
            From footage to finished cut in three steps
          </h2>
        </div>

        <div className="relative mt-16 grid grid-cols-1 gap-10 md:grid-cols-3">
          <div className="absolute left-0 right-0 top-8 hidden h-px bg-[var(--border)] md:block" />
          {STEPS.map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="relative text-center"
            >
              <div className="relative z-10 mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--espresso)] shadow-lg">
                <s.icon className="h-8 w-8 text-[var(--accent)]" strokeWidth={2} />
                <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-[var(--accent-ink)] shadow-sm">
                  {s.step}
                </span>
              </div>
              <h3 className="mt-5 font-semibold text-[var(--ink)]">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[var(--ink-soft)]">
                {s.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
