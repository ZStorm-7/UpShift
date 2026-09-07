
const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Home", href: "#" },
      { label: "Pricing", href: "#pricing" },
      { label: "Download", href: "#download" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Docs", href: "https://docs.cueframe.ai" },
      { label: "API reference", href: "https://docs.cueframe.ai/docs/api" },
      { label: "Setup guide", href: "https://docs.cueframe.ai/docs/setup" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Changelog", href: "https://docs.cueframe.ai/changelog" },
      { label: "Status", href: "https://status.cueframe.ai" },
      { label: "Guides", href: "https://cueframe.ai/guides" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: "#" },
      { label: "Privacy", href: "https://cueframe.ai/privacy" },
      { label: "Terms", href: "https://cueframe.ai/terms" },
    ],
  },
]

const SOCIALS = [
  { initials: "X", href: "#", label: "X" },
  { initials: "GH", href: "#", label: "GitHub" },
  { initials: "in", href: "#", label: "LinkedIn" },
  { initials: "YT", href: "#", label: "YouTube" },
]

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]/70">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <a href="#" className="flex items-center gap-2 font-semibold tracking-tight text-[var(--ink)]">
              <img src="/favicon.svg" alt="CueFrame" className="h-7 w-7" />
              CueFrame
            </a>
            <p className="mt-3 max-w-xs text-sm text-[var(--ink-soft)]">
              A video editing API for AI agents.
            </p>
            <div className="mt-5 flex gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[10px] font-semibold text-[var(--ink-soft)] transition-colors hover:border-[color:var(--accent)] hover:text-[var(--ink)]"
                >
                  {s.initials}
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold text-[var(--ink)]">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[var(--border)] pt-6 text-xs text-[var(--ink-soft)] sm:flex-row">
          <p>© {new Date().getFullYear()} CueFrame. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
