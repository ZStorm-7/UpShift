import { Apple, Download, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface DownloadButtonProps {
  className?: string
  compact?: boolean
  /** Set true when placing this on a surface that's always dark (e.g. the
   * espresso CTA panel), regardless of the page's light/dark theme. */
  onDark?: boolean
}

/**
 * Primary macOS download CTA + a "Windows — coming soon" indicator.
 * Point `href` at your real .dmg (or a redirect) once it's hosted.
 */
export function DownloadButton({ className, compact = false, onDark = false }: DownloadButtonProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-3", className)}>
      <a
        href="#download"
        className={cn(
          "group flex items-center gap-2 rounded-lg bg-[var(--accent)] font-medium text-[var(--accent-ink)] shadow-lg shadow-[#f4c430]/30 transition-transform hover:scale-[1.03]",
          compact ? "px-4 py-2 text-sm" : "px-5 py-3 text-sm"
        )}
      >
        <Apple className="h-4 w-4" />
        Download for macOS
        <Download className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-y-0.5" />
      </a>
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs font-medium",
          onDark
            ? "border-white/20 text-white/60"
            : "border-[var(--border)] text-[var(--ink-soft)]"
        )}
      >
        <Clock className="h-3.5 w-3.5" />
        Windows — coming soon
      </span>
    </div>
  )
}
