import { ThemeToggle } from "./ThemeToggle"

const LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
]

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)]/80 bg-[var(--bg-1)]/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#" className="flex items-center gap-2 font-semibold tracking-tight text-[var(--ink)]">
          <img src="/favicon.svg" alt="CueFrame" className="h-7 w-7" />
          CueFrame
        </a>

        <nav className="hidden items-center gap-8 text-sm font-medium text-[var(--ink-soft)] md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-[var(--ink)]">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <a
            href="https://app.cueframe.ai"
            className="hidden text-sm font-medium text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] sm:block"
          >
            Sign in
          </a>
          <a
            href="#download"
            className="rounded-lg bg-[var(--espresso)] px-4 py-2 text-sm font-medium text-[var(--accent-soft)] transition-transform hover:scale-[1.03]"
          >
            Download
          </a>
        </div>
      </div>
    </header>
  )
}
