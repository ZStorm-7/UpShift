import { motion } from "motion/react"
import { UploadCloud } from "lucide-react"

/**
 * A large, full-bleed showcase slot for your own finished render.
 *
 * This intentionally ships as a placeholder — no hotlinked video — so it
 * never shows someone else's footage by accident. To activate it:
 *   1. Drop your .mp4 into `public/` (e.g. `public/showcase.mp4`)
 *   2. Set SHOWCASE_SRC below to "/showcase.mp4"
 * Once SHOWCASE_SRC is set, the placeholder is replaced with your video
 * automatically.
 */
const SHOWCASE_SRC = ""

export function Showcase() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-2xl text-center"
      >
        <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">
          Showcase
        </span>
        <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
          See a finished cut
        </h2>
        <p className="mt-4 text-balance text-[var(--ink-soft)]">
          One full render, start to finish — swap this in for your own the
          moment you have one.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="relative mx-auto mt-14 max-w-4xl"
      >
        <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-mesh opacity-50 blur-3xl" />

        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-black shadow-[0_30px_90px_-20px_var(--shadow-tint)]">
          <div className="flex items-center gap-2 border-b border-white/10 bg-black/60 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-2 text-xs font-medium text-white/50">
              showcase.mp4
            </span>
          </div>

          <div className="relative aspect-video bg-gradient-to-br from-[#2c1c10] via-[#1a1109] to-black">
            {SHOWCASE_SRC ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                className="absolute inset-0 h-full w-full object-cover"
                src={SHOWCASE_SRC}
                controls
                playsInline
                loop
                preload="metadata"
              />
            ) : (
              <div
                className="absolute inset-6 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-white/15 text-center"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
                  <UploadCloud className="h-6 w-6 text-white/40" />
                </span>
                <p className="text-sm font-medium text-white/60">
                  Your video goes here
                </p>
                <p className="max-w-xs text-xs text-white/35">
                  Drop your render into <code className="text-white/50">public/showcase.mp4</code>{" "}
                  and it'll appear in this frame automatically.
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </section>
  )
}
