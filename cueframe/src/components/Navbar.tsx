import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Menu, X } from "lucide-react"

const LINKS = [
  { label: "Desktop", href: "#/desktop" },
  { label: "Developers", href: "#/developers" },
  { label: "How it works", href: "#/how-it-works" },
  { label: "Pricing", href: "#/pricing" },
  { label: "FAQ", href: "#/faq" },
]

export function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // An open menu that survives a resize to desktop leaves the page scroll
  // locked with no visible way to unlock it.
  useEffect(() => {
    if (!open) return
    const mq = window.matchMedia("(min-width: 768px)")
    const close = () => setOpen(false)
    mq.addEventListener("change", close)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      mq.removeEventListener("change", close)
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open])

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "border-b border-[var(--border)] bg-[var(--bg-1)]/85 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-6">
        <a
          href="#"
          className="flex items-center gap-2.5 font-display text-[15px] font-bold tracking-tight text-[var(--ink)]"
          style={{ fontFamily: "var(--font-display)", fontVariationSettings: '"opsz" 24', fontWeight: 560 }}
        >
          <img src="/favicon.svg" alt="" aria-hidden className="h-7 w-7" />
          CueFrame
        </a>

        <nav className="hidden items-center gap-9 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="https://app.cueframe.ai"
            className="hidden text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] sm:block"
          >
            Sign in
          </a>
          <a
            href="#get-started"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] transition-opacity hover:opacity-90"
          >
            Start building
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="-mr-1 flex h-10 w-10 items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-b border-[var(--border)] bg-[var(--bg-1)] md:hidden"
          >
            <div className="flex flex-col px-5 pb-5 pt-1">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-[var(--border)] py-3.5 text-[15px] text-[var(--ink)]"
                >
                  {l.label}
                </a>
              ))}
              <a
                href="https://app.cueframe.ai"
                className="py-3.5 text-[15px] text-[var(--ink)]"
              >
                Sign in
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
