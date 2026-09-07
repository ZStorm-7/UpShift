import { motion } from "motion/react"
import { RefreshCw, FileVideo2, Eye, Upload, ArrowRight } from "lucide-react"

// Each card links down to its own preview slot in FeaturePreviews — click
// one to jump straight to where its screenshot/recording will live.
const ITEMS = [
  {
    icon: RefreshCw,
    title: "Byte-for-byte repeatable",
    desc: "Re-run the same composition, get the same video back — every time.",
    previewId: "preview-repeatable",
  },
  {
    icon: Upload,
    title: "File or URL",
    desc: "Point CueFrame at footage as an upload or just a link.",
    previewId: "preview-file-or-url",
  },
  {
    icon: Eye,
    title: "Free previews",
    desc: "Check an edit for pennies. You only pay to render the final cut.",
    previewId: "preview-free-previews",
  },
  {
    icon: FileVideo2,
    title: "Export to Premiere or Final Cut",
    desc: "Hand off the timeline any time and finish by hand — no lock-in.",
    previewId: "preview-export",
  },
]

export function MiniFeatures() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((it, i) => (
          <motion.a
            key={it.title}
            href={`#${it.previewId}`}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            className="group block rounded-xl border border-transparent p-3 -m-3 transition-colors hover:border-[var(--border)] hover:bg-[var(--surface)]"
          >
            <it.icon className="h-5 w-5 text-[color:var(--accent)]" />
            <h3 className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
              {it.title}
              <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-soft)] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">{it.desc}</p>
          </motion.a>
        ))}
      </div>
    </section>
  )
}
