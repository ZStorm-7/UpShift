import { useState } from "react"
import { motion } from "motion/react"
import {
  Scissors,
  Crop,
  Wand2,
  Volume2,
  Sparkles,
  SlidersHorizontal,
  Play,
  Move3d,
  Palette,
  AudioWaveform,
  ZoomIn,
  Check,
} from "lucide-react"

// Real CueFrame output — swap these for your own render URLs any time.
// Click any thumbnail in the Media panel to load it into the canvas.
const ASSETS = [
  { label: "marrow", src: "https://cueframe.ai/showcase/marrow.mp4" },
  { label: "kiln", src: "https://cueframe.ai/showcase/kiln.mp4" },
  { label: "fern-flint", src: "https://cueframe.ai/showcase/fern-flint.mp4" },
  { label: "noctua", src: "https://cueframe.ai/showcase/noctua.mp4" },
  { label: "marrow 9:16", src: "https://cueframe.ai/showcase/marrow-9x16.mp4" },
  { label: "marrow 1:1", src: "https://cueframe.ai/showcase/marrow-1x1.mp4" },
  { label: "marrow overlay", src: "https://cueframe.ai/showcase/marrow-overlay-a.mp4" },
]

const CLIPS = [
  { label: "intro.mov", width: "14%", color: "from-[#f4c430] to-[#ffd966]" },
  { label: "b-roll_01", width: "22%", color: "from-[#e0ac00] to-[#f4c430]" },
  { label: "interview", width: "34%", color: "from-[#f4c430] to-[#ffe9a8]" },
  { label: "outro.mov", width: "16%", color: "from-[#ffd966] to-[#f4c430]" },
]

const bars = Array.from({ length: 40 })

const PROPERTY_GROUPS = [
  {
    label: "Transform",
    icon: Move3d,
    rows: [
      { label: "Format", value: "9:16" },
      { label: "Framing", value: "Auto (speaker)" },
      { label: "Position", value: "x: 20%, y: 0%" },
    ],
  },
  {
    label: "Effects",
    icon: Palette,
    rows: [
      { label: "Captions", value: "Composited" },
      { label: "Color", value: "Auto match" },
    ],
  },
  {
    label: "Audio",
    icon: AudioWaveform,
    rows: [
      { label: "Speaker track", value: "On" },
      { label: "Denoise", value: "On" },
    ],
  },
]

/**
 * A diffusion.studio-style four-pane editor chrome — asset rail, canvas,
 * timeline, inspector — wrapped around a real CueFrame render. Swap
 * CANVAS_SRC / ASSETS for your own footage whenever you like.
 */
export function EditorMock() {
  const [activeAsset, setActiveAsset] = useState(0)
  const [erroredAssets, setErroredAssets] = useState<Record<string, boolean>>({})
  const [renderStep, setRenderStep] = useState(0) // 0 idle, 1 reviewing, 2 assembling, 3 done
  const canvas = ASSETS[activeAsset]

  const handleRender = () => {
    if (renderStep !== 0) return
    setRenderStep(1)
    setTimeout(() => setRenderStep(2), 700)
    setTimeout(() => setRenderStep(3), 1500)
    setTimeout(() => setRenderStep(0), 2600)
  }

  const RENDER_LABELS: Record<number, string> = {
    1: "Reviewing footage...",
    2: "Assembling cut...",
    3: "Done",
  }

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {/* glow behind the editor */}
      <div className="absolute -inset-10 -z-10 rounded-[3rem] bg-gradient-to-tr from-[#f4c430]/20 via-[#ffe9a8]/10 to-transparent blur-3xl" />

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[#141019] shadow-[0_30px_80px_-20px_rgba(60,40,10,0.25)]">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-white/10 bg-black/30 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-xs font-medium text-white/40">
            cueframe — compose.ts
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_220px]">
          {/* left: asset library panel — slides in from the side on scroll */}
          <motion.div
            initial={{ x: -48, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="hidden flex-col border-r border-white/10 bg-black/20 md:flex"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-white/40">
                Media
              </span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/40">
                {ASSETS.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5">
              {ASSETS.map((a, ai) => (
                <motion.button
                  key={a.label}
                  type="button"
                  onClick={() => setActiveAsset(ai)}
                  aria-pressed={activeAsset === ai}
                  initial={{ opacity: 0, y: 14, scale: 0.97 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{
                    duration: 0.4,
                    delay: ai * 0.06,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={`group relative overflow-hidden rounded-lg border bg-black text-left transition-colors ${
                    activeAsset === ai
                      ? "border-[var(--accent)]"
                      : "border-white/10 hover:border-[var(--accent)]/50"
                  }`}
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-black">
                    {erroredAssets[a.label] ? (
                      <div className="flex h-full w-full items-center justify-center bg-white/5">
                        <Play className="h-4 w-4 text-white/30" />
                      </div>
                    ) : (
                      <video
                        src={a.src}
                        className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        onError={() =>
                          setErroredAssets((prev) => ({ ...prev, [a.label]: true }))
                        }
                      />
                    )}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur">
                        <Play className="h-3 w-3 fill-white text-white" />
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span
                      className={`truncate text-[11px] font-medium ${
                        activeAsset === ai ? "text-[var(--accent)]" : "text-white/70"
                      }`}
                    >
                      {a.label}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* center: infinite canvas + timeline */}
          <div className="border-b border-white/10 md:border-b-0 md:border-r">
            {/* infinite canvas — dot grid backdrop, video floats inside open space, diffusion.studio-style */}
            <div
              className="relative m-4 overflow-hidden rounded-xl bg-black/40"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(255,255,255,0.09) 1px, transparent 1px)",
                backgroundSize: "18px 18px",
              }}
            >
              <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 text-[10px] font-medium text-white/60 backdrop-blur">
                <ZoomIn className="h-3 w-3" />
                <span>68% · &lt;120ms</span>
              </div>

              <motion.div
                key={canvas.label}
                initial={{ scale: 0.97, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="relative mx-auto my-8 aspect-video w-[78%] overflow-hidden rounded-lg bg-gradient-to-br from-[#2c1c10] to-[#4a2f1a] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
              >
                {!erroredAssets[canvas.label] && (
                  <video
                    src={canvas.src}
                    className="absolute inset-0 h-full w-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onError={() =>
                      setErroredAssets((prev) => ({ ...prev, [canvas.label]: true }))
                    }
                  />
                )}
                {/* dynamic framing box */}
                <motion.div
                  initial={{ x: "20%" }}
                  animate={{ x: ["20%", "55%", "20%"] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-1/2 h-[70%] w-[30%] -translate-y-1/2 rounded-md border-2 border-[#ffe9a8]/80"
                />
                <span className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-[10px] font-medium text-white/90 backdrop-blur">
                  {canvas.label} · auto-framed
                </span>
                <span className="absolute right-3 top-3 rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-white/80 backdrop-blur">
                  00:12 / 00:47
                </span>
              </motion.div>

              {/* ghost clips scattered in the open canvas space, reinforcing the spatial/infinite feel */}
              <div className="pointer-events-none absolute -left-4 top-6 hidden h-16 w-24 rotate-[-4deg] rounded-md border border-white/10 bg-white/[0.03] lg:block" />
              <div className="pointer-events-none absolute -right-6 bottom-6 hidden h-14 w-20 rotate-[5deg] rounded-md border border-white/10 bg-white/[0.03] lg:block" />
            </div>

            {/* AI prompt bar */}
            <div className="mx-4 mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              {renderStep === 0 ? (
                <>
                  <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="truncate text-sm text-white/60">
                    "Cut the intro to 5s, follow the speaker, export 9:16 and 1:1"
                  </span>
                </>
              ) : (
                <motion.span
                  key={renderStep}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2 truncate text-sm text-white/70"
                >
                  {renderStep < 3 ? (
                    <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-[var(--accent)]" />
                  ) : (
                    <Check className="h-4 w-4 shrink-0 text-[#8fe3a3]" strokeWidth={3} />
                  )}
                  {RENDER_LABELS[renderStep]}
                </motion.span>
              )}
              <button
                type="button"
                onClick={handleRender}
                disabled={renderStep !== 0}
                className="ml-auto shrink-0 rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--accent-ink)] transition-opacity disabled:opacity-50"
              >
                Render
              </button>
            </div>

            {/* timeline */}
            <div className="mx-4 mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center gap-3 text-white/40">
                <Scissors className="h-3.5 w-3.5" />
                <Crop className="h-3.5 w-3.5" />
                <Wand2 className="h-3.5 w-3.5" />
                <Volume2 className="h-3.5 w-3.5" />
                <span className="ml-auto font-mono text-[10px]">00:00:47:12</span>
              </div>

              {/* waveform track */}
              <div className="mb-2 flex h-6 items-end gap-[2px] rounded-md bg-black/30 px-2 py-1">
                {bars.map((_, i) => (
                  <span
                    key={i}
                    className="w-[3px] flex-1 rounded-full bg-[var(--accent-soft)]/60"
                    style={{ height: `${20 + Math.abs(Math.sin(i * 0.7)) * 80}%` }}
                  />
                ))}
              </div>

              {/* clip track */}
              <div className="flex h-8 gap-1 overflow-hidden rounded-md">
                {CLIPS.map((clip) => (
                  <div
                    key={clip.label}
                    style={{ width: clip.width }}
                    className={`flex items-center justify-center bg-gradient-to-r ${clip.color} px-2`}
                  >
                    <span className="truncate text-[10px] font-medium text-[var(--accent-ink)]/80">
                      {clip.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex h-2 items-center">
                <motion.div
                  initial={{ left: "0%" }}
                  animate={{ left: ["0%", "100%"] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                  className="relative h-2 w-[2px] bg-white/70"
                />
              </div>
            </div>
          </div>

          {/* right: inspector + agent panel — slides in from the side on scroll */}
          <motion.div
            initial={{ x: 48, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.1 }}
            className="flex flex-col bg-black/20"
          >
            <div className="border-b border-white/10 p-3">
              <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-white/40">
                <SlidersHorizontal className="h-3 w-3" />
                Inspector
              </div>
              <div className="space-y-3">
                {PROPERTY_GROUPS.map((group, gi) => (
                  <motion.div
                    key={group.label}
                    initial={{ opacity: 0, x: 8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: gi * 0.08 }}
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-white/30">
                      <group.icon className="h-3 w-3" />
                      {group.label}
                    </div>
                    <div className="space-y-1 rounded-md bg-white/[0.03] p-1.5">
                      {group.rows.map((p) => (
                        <div key={p.label} className="flex items-center justify-between text-xs">
                          <span className="text-white/40">{p.label}</span>
                          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10.5px] text-white/70">
                            {p.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="flex flex-1 flex-col p-3 font-mono text-[10.5px] leading-relaxed text-[#e8d9c2]">
              <span className="mb-2 text-[10px] uppercase tracking-wide text-white/40">
                agent.compose
              </span>
              <pre className="whitespace-pre-wrap">
{`await cueframe.compose({
  source: "raw/interview.mov",
  brief: "highlight reel,
    follow speaker",
  formats: ["9:16","1:1"],
})

> rendering 9:16... `}<span className="text-[#ffe9a8]">done</span>{`
> rendering 1:1...    `}<span className="text-[#ffe9a8]">done</span>{`
> $0.50 · 2 renders`}
              </pre>
              <div className="mt-auto flex items-center gap-1.5 pt-3 text-[10px] text-white/40">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4ade80]" />
                connected · Claude Code
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
