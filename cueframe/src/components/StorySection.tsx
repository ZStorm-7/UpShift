import type { ReactNode } from "react"
import { motion } from "motion/react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface StorySectionProps {
  id?: string
  eyebrow: string
  title: string
  description: string
  cta?: { label: string; href: string }
  visual: ReactNode
  tone?: "default" | "soft"
}

/**
 * The recurring diffusion.studio pattern: a short centered text block
 * (eyebrow + headline + description + one CTA) followed by a large
 * full-width visual underneath — used for every "story" beat on the page
 * instead of an icon-grid feature list.
 */
export function StorySection({
  id,
  eyebrow,
  title,
  description,
  cta,
  visual,
  tone = "default",
}: StorySectionProps) {
  return (
    <section
      id={id}
      className={cn("py-24 sm:py-28", tone === "soft" && "bg-[var(--bg-2)]/55")}
    >
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">
            {eyebrow}
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-balance text-[var(--ink-soft)]">{description}</p>
          {cta && (
            <a
              href={cta.href}
              className="group mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)] transition-colors hover:text-[color:var(--accent)]"
            >
              {cta.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-14"
        >
          {visual}
        </motion.div>
      </div>
    </section>
  )
}
