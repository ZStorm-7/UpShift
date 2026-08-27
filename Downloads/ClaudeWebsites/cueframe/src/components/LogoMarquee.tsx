import { Marquee } from "./ui/Marquee"

const TOOLS = [
  "Claude Code",
  "Claude Desktop",
  "Cursor",
  "Codex",
  "VS Code",
  "ChatGPT",
  "Gemini CLI",
  "Copilot CLI",
  "Windsurf",
  "Cline",
  "Zed",
  "Codeium",
  "Replit",
  "Amazon Q",
  "Aider",
  "Continue",
]

export function LogoMarquee() {
  return (
    <section className="border-y border-[var(--border)] bg-[var(--surface)]/60 py-8">
      <p className="mb-5 text-center text-xs font-medium uppercase tracking-wider text-[var(--ink-soft)]">
        Works with the agent you already use
      </p>
      <Marquee className="[--gap:2.5rem]">
        {TOOLS.map((tool) => (
          <span
            key={tool}
            className="whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 text-sm font-medium text-[var(--ink-soft)]"
          >
            {tool}
          </span>
        ))}
      </Marquee>
    </section>
  )
}
