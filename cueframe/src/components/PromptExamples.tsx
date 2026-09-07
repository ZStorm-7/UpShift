import { motion } from "motion/react"
import { Terminal } from "lucide-react"

// Every line here maps to a real CueFrame capability — nothing aspirational.
const PROMPTS = [
  '"Cut the intro to 5 seconds"',
  '"Follow the speaker, keep them centered"',
  '"Export as 9:16, 1:1, and 16:9"',
  '"Add composited captions in the brand color"',
  '"Transcribe this and pull the best 30 seconds"',
  '"Render a 720p preview before the final pass"',
  '"No footage yet — generate this from a brief"',
  '"Re-render at 4K for the client cut"',
  '"Point it at this URL instead of a file"',
]

export function PromptExamples() {
  return (
    <section className="bg-[var(--bg-2)]/55 py-24 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">
            Agent-native
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
            Direct your edit with prompts
          </h2>
          <p className="mt-4 text-balance text-[var(--ink-soft)]">
            No timeline to learn. Your agent describes the intent in plain
            language — CueFrame turns it into a render.
          </p>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROMPTS.map((p, i) => (
            <motion.div
              key={p}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
            >
              <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />
              <span className="font-mono text-sm leading-snug text-[var(--ink-soft)]">{p}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
