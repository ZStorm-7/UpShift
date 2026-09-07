import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { Play } from "lucide-react"

// The real cueframe.ai hero clip — a screen recording of the shipped
// desktop editor, not a render output. Swap for your own URL any time.
const MAIN_SRC = "https://cueframe.ai/app/editor-demo.mp4"
const MAIN_POSTER = "https://cueframe.ai/app/editor-demo-poster.webp"

// Remote render assets occasionally stall (slow CDN, transient 5xx) without
// ever firing the video element's own error event — so a plain onError
// handler alone can leave the frame stuck on a black box forever. This
// backs it with a timeout: if the video hasn't produced a frame in time, it
// falls back to the same "unavailable" state as a hard error.
const STALL_TIMEOUT_MS = 4500

/**
 * The strongest argument on the page — one real render, shown plainly,
 * beside the thesis instead of under it. No scroll-jacked zoom, no
 * simulated multi-pane editor, no wall of duplicate clips: just the output.
 */
export function Showcase() {
  const [errored, setErrored] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (errored) return
    const timer = setTimeout(() => {
      if ((videoRef.current?.readyState ?? 0) < 2) setErrored(true)
    }, STALL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [errored])

  return (
    <motion.div
      initial={{ opacity: 0, x: 28 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative"
    >
      <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-tr from-[var(--chroma-b)]/16 via-[var(--chroma-r)]/10 to-transparent blur-3xl" />

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] shadow-[0_30px_90px_-24px_var(--shadow-tint)]">
        <div className="flex items-center gap-2 border-b border-white/10 bg-black/50 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-xs font-medium text-white/40">
            editor · live session
          </span>
          <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-white/35 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
            connected · Claude Code
          </span>
        </div>

        <div className="relative aspect-video overflow-hidden bg-[#141019]">
          {errored ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-white/[0.03]">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5">
                <Play className="h-4 w-4 text-white/35" />
              </span>
              <span className="text-[11px] text-white/30">
                Render unavailable — try again shortly
              </span>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={MAIN_SRC}
              poster={MAIN_POSTER}
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              onError={() => setErrored(true)}
            />
          )}

          <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-black/55 px-3 py-1.5 text-[13px] font-medium text-white backdrop-blur">
            Ask for a change.{" "}
            <span className="text-[var(--chroma-b)]">Watch it land.</span>
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2.5 font-mono text-[11px] text-[var(--ink-dim)]">
        <span>16:9</span>
        <span className="opacity-40">·</span>
        <span>1:1</span>
        <span className="opacity-40">·</span>
        <span>9:16</span>
        <span className="ml-1.5 opacity-70">— one edit, reflowed</span>
      </div>
    </motion.div>
  )
}
