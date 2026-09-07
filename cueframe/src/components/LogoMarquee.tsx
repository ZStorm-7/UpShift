import { Marquee } from "./ui/Marquee"

const TOOLS = [
  { name: "Claude Code", url: "https://claude.com/product/claude-code" },
  { name: "Claude Desktop", url: "https://claude.ai/download" },
  { name: "Cursor", url: "https://cursor.com" },
  { name: "Codex", url: "https://openai.com/codex" },
  { name: "VS Code", url: "https://code.visualstudio.com" },
  { name: "ChatGPT", url: "https://chatgpt.com" },
  { name: "Gemini CLI", url: "https://github.com/google-gemini/gemini-cli" },
  { name: "Copilot CLI", url: "https://github.com/features/copilot" },
  { name: "Windsurf", url: "https://windsurf.com" },
  { name: "Cline", url: "https://cline.bot" },
  { name: "Zed", url: "https://zed.dev" },
  { name: "Codeium", url: "https://codeium.com" },
  { name: "Replit", url: "https://replit.com" },
  { name: "Amazon Q", url: "https://aws.amazon.com/q/developer/" },
  { name: "Aider", url: "https://aider.chat" },
  { name: "Continue", url: "https://continue.dev" },
]

export function LogoMarquee() {
  return (
    <section className="relative overflow-hidden border-y border-[var(--border)] bg-[var(--bg-2)] py-9">
      <p className="mb-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-dim)]">
        Connects to the agent you already use
      </p>

      <Marquee className="[--gap:3rem]">
        {TOOLS.map((tool) => (
          <a
            key={tool.name}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap text-[15px] font-medium text-[var(--ink-soft)] transition-colors hover:text-[var(--accent)]"
          >
            {tool.name}
          </a>
        ))}
      </Marquee>

      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--bg-2)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[var(--bg-2)] to-transparent" />
    </section>
  )
}
