import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"

// Site defaults to dark mode — near-black ground, white text, yellow
// accent, matching the shipped cueframe.ai. It only starts in light mode if
// the visitor previously chose light mode (persisted in localStorage).
function getInitialTheme(): "light" | "dark" {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.dataset.theme
    if (attr === "light" || attr === "dark") return attr
  }
  return "dark"
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem("cueframe-theme", theme)
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [theme])

  return (
    <button
      onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      aria-label="Toggle dark mode"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
    >
      {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  )
}
