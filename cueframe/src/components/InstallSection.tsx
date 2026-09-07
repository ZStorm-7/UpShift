import { useState } from "react"
import { motion } from "motion/react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { AnimatedSpan, Terminal } from "./ui/Terminal"

const METHODS = [
  {
    id: "cli",
    label: "CLI",
    title: "terminal",
    lines: [
      { text: "# connect any agent tool in one command", type: "comment" },
      { text: "npx -y cueframe install", type: "command" },
      { text: "✓ browser opened to authorize — no API key needed", type: "success" },
      { text: "✓ connected: Claude Code, Cursor, VS Code, ChatGPT...", type: "success" },
    ],
  },
  {
    id: "skill",
    label: "Claude Code skill",
    title: "claude-code",
    lines: [
      { text: "# paste this once into a Claude Code session", type: "comment" },
      { text: "> read https://cueframe.ai/skill.md and set up CueFrame", type: "command" },
      { text: "reading skill...", type: "output" },
      { text: "✓ CueFrame is ready to compose and render", type: "success" },
    ],
  },
  {
    id: "mcp",
    label: "MCP connector",
    title: "chatgpt / claude desktop",
    lines: [
      { text: "# add as a custom connector", type: "comment" },
      { text: "Settings → Connectors → Add custom connector", type: "command" },
      { text: "URL: api.cueframe.ai/v1/mcp", type: "command" },
      { text: "✓ CueFrame available in every chat", type: "success" },
    ],
  },
] as const

const typeClasses: Record<string, string> = {
  comment: "text-white/35",
  command: "text-[var(--chroma-b)]",
  output: "text-white/55",
  success: "text-[#7ee0a8]",
}

export function InstallSection() {
  const [active, setActive] = useState(0)
  const method = METHODS[active]

  return (
    <section id="get-started" className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-2xl text-center"
      >
        <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">
          Get started
        </span>
        <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
          Try it now
        </h2>
        <p className="mt-4 text-balance text-[var(--ink-soft)]">
          Connect from whichever agent you already use — $20 in free credit is
          waiting, no card required.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="mt-12"
      >
        <div role="tablist" aria-label="Install method" className="mb-3 flex flex-wrap justify-center gap-1.5">
          {METHODS.map((m, i) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={active === i}
              onClick={() => setActive(i)}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors",
                active === i
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <Terminal key={method.id} title={method.title} className="min-h-[200px]">
          {method.lines.map((line, i) => (
            <AnimatedSpan key={i} delay={i * 220} className={typeClasses[line.type]}>
              {line.text}
            </AnimatedSpan>
          ))}
        </Terminal>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="https://docs.cueframe.ai"
            className="group flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-ink)] shadow-lg shadow-[var(--accent)]/30 transition-transform hover:scale-[1.03]"
          >
            Read the docs
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="https://app.cueframe.ai"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)]"
          >
            Open in browser
          </a>
        </div>
      </motion.div>
    </section>
  )
}
