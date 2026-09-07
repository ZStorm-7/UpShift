import { useState } from "react"
import { Play } from "lucide-react"

const SRC = "https://cueframe.ai/showcase/marrow.mp4"
const SRC_9X16 = "https://cueframe.ai/showcase/marrow-9x16.mp4"
const SRC_1X1 = "https://cueframe.ai/showcase/marrow-1x1.mp4"

const FORMATS = [
  { label: "16:9 · YouTube", ratio: "aspect-video", src: SRC },
  { label: "1:1 · Feed", ratio: "aspect-square", src: SRC_1X1 },
  { label: "9:16 · Reels/Shorts", ratio: "aspect-[9/16]", src: SRC_9X16 },
]

/** One clip, reflowed to three real aspect ratios side by side. */
export function FormatGrid() {
  const [errored, setErrored] = useState<Record<string, boolean>>({})

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 items-end gap-4 sm:grid-cols-3">
      {FORMATS.map((f) => (
        <div key={f.label} className="flex flex-col items-center gap-2">
          <div
            className={`relative w-full ${f.ratio} overflow-hidden rounded-xl border border-[var(--border)] bg-[#141019] shadow-[0_20px_50px_-20px_var(--shadow-tint)]`}
          >
            {errored[f.label] ? (
              <div className="flex h-full w-full items-center justify-center bg-white/5">
                <Play className="h-5 w-5 text-white/30" />
              </div>
            ) : (
              <video
                src={f.src}
                className="h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                onError={() => setErrored((prev) => ({ ...prev, [f.label]: true }))}
              />
            )}
          </div>
          <span className="text-xs font-medium text-[var(--ink-soft)]">{f.label}</span>
        </div>
      ))}
    </div>
  )
}
