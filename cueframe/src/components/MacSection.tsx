import { motion } from "motion/react"
import { Apple } from "lucide-react"
import { DownloadButton } from "./DownloadButton"

export function MacSection() {
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
            Desktop app
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
            CueFrame for Mac
          </h2>
          <p className="mt-4 text-balance text-[var(--ink-soft)]">
            A native desktop app for macOS, for reviewing renders and managing
            projects without leaving your Mac. Windows support is coming soon —
            the API and CLI your agent calls already work on any OS today.
          </p>
          <div className="mt-6 flex justify-center">
            <DownloadButton />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative mx-auto mt-14 max-w-3xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center shadow-[0_30px_80px_-20px_var(--shadow-tint)]"
        >
          <div className="bg-mesh pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--espresso)] shadow-lg">
            <Apple className="h-9 w-9 text-[var(--accent)]" />
          </div>
          <p className="relative mt-5 text-sm font-medium text-[var(--ink-soft)]">
            macOS 13 or later · Apple Silicon &amp; Intel
          </p>
        </motion.div>
      </div>
    </section>
  )
}
