import { motion } from "motion/react"
import { ImageIcon } from "lucide-react"

// One blank preview slot per MiniFeatures card, linked to by id (#preview-*)
// so clicking a card above jumps straight here. Left intentionally empty —
// drop a screenshot or recording into public/ and swap SRC in per slot below
// once you have one, same pattern as Showcase.tsx.
const SLOTS = [
  { id: "preview-repeatable", title: "Byte-for-byte repeatable", src: "" },
  { id: "preview-file-or-url", title: "File or URL", src: "" },
  { id: "preview-free-previews", title: "Free previews", src: "" },
  { id: "preview-export", title: "Export to Premiere or Final Cut", src: "" },
]

export function FeaturePreviews() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {SLOTS.map((slot, i) => (
          <motion.div
            key={slot.id}
            id={slot.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.45, delay: i * 0.06 }}
            className="scroll-mt-24"
          >
            <p className="mb-2 text-sm font-medium text-[var(--ink-soft)]">{slot.title}</p>
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="relative aspect-video">
                {slot.src ? (
                  <img
                    src={slot.src}
                    alt={slot.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-2)]">
                      <ImageIcon className="h-4 w-4 text-[var(--ink-soft)]" />
                    </span>
                    <p className="text-xs text-[var(--ink-soft)]/70">Preview coming soon</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
