import { motion } from "motion/react"

const STATS = [
  { value: "$0.50", label: "Starting price per render, up to a minute" },
  { value: "4K", label: "Maximum output resolution" },
  { value: "10+", label: "Agent tools that connect in one command" },
  { value: "$20", label: "Free credit on every new account" },
]

export function Stats() {
  return (
    <section className="border-y border-[var(--border)] bg-[var(--surface)]/60 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
            Built for creative speed
          </h2>
        </div>
        <div className="mt-14 grid grid-cols-2 gap-8 sm:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="text-center"
            >
              <p className="text-4xl font-semibold tracking-tight text-[color:var(--accent)] sm:text-5xl">
                {s.value}
              </p>
              <p className="mx-auto mt-2 max-w-[14rem] text-sm text-[var(--ink-soft)]">
                {s.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
