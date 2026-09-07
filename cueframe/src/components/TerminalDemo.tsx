import { useState } from "react"
import { cn } from "@/lib/utils"
import { AnimatedSpan, Terminal, TypingAnimation } from "./ui/Terminal"

interface AgentTab {
  id: string
  label: string
  title: string
  lines: { text: string; type: "comment" | "command" | "output" | "success" }[]
}

const TABS: AgentTab[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    title: "claude-code",
    lines: [
      { text: "# install once", type: "comment" },
      { text: "npx cueframe init", type: "command" },
      { text: "✓ connected to Claude Code", type: "success" },
      { text: "", type: "output" },
      { text: "> cueframe compose raw/interview.mov \\", type: "command" },
      { text: '    --brief "highlight reel, follow speaker" \\', type: "command" },
      { text: '    --formats 9:16,1:1', type: "command" },
      { text: "building timeline (4 clips)...", type: "output" },
      { text: "rendering 9:16... done", type: "success" },
      { text: "rendering 1:1... done", type: "success" },
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    title: "cursor — agent chat",
    lines: [
      { text: "# in a Cursor agent chat", type: "comment" },
      { text: 'You: "cut interview.mov into a 30s reel, vertical"', type: "command" },
      { text: "Agent: calling cueframe.compose(...)", type: "output" },
      { text: "", type: "output" },
      { text: "await cueframe.compose({", type: "command" },
      { text: '  source: "raw/interview.mov",', type: "command" },
      { text: '  brief: "30s reel, follow speaker",', type: "command" },
      { text: '  formats: ["9:16"],', type: "command" },
      { text: "})", type: "command" },
      { text: "✓ render ready · $0.50", type: "success" },
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    title: "chatgpt — cueframe plugin",
    lines: [
      { text: "# ChatGPT with the CueFrame connector enabled", type: "comment" },
      { text: 'You: "make a 1:1 highlight from today\'s upload"', type: "command" },
      { text: "ChatGPT: using CueFrame...", type: "output" },
      { text: "", type: "output" },
      { text: "POST /v1/compose", type: "command" },
      { text: '{ "source": "today.mov", "formats": ["1:1"] }', type: "command" },
      { text: "200 OK", type: "output" },
      { text: "✓ render ready · $0.50", type: "success" },
    ],
  },
  {
    id: "vscode",
    label: "VS Code",
    title: "vscode — copilot chat",
    lines: [
      { text: "# any agent extension in VS Code", type: "comment" },
      { text: "$ cueframe compose --watch ./raw", type: "command" },
      { text: "watching ./raw for new footage...", type: "output" },
      { text: "new file detected: standup.mov", type: "output" },
      { text: "auto-composing with default brief...", type: "output" },
      { text: "rendering 16:9... done", type: "success" },
      { text: "✓ synced to /renders", type: "success" },
    ],
  },
]

const typeClasses: Record<AgentTab["lines"][number]["type"], string> = {
  comment: "text-white/35",
  command: "text-[var(--chroma-b)]",
  output: "text-white/55",
  success: "text-[#7ee0a8]",
}

export function TerminalDemo() {
  const [active, setActive] = useState(0)
  const tab = TABS[active]

  return (
    <div className="w-full">
      {/* tabs */}
      <div
        role="tablist"
        aria-label="Choose your AI tool"
        className="mb-3 flex flex-wrap gap-1.5"
      >
        {TABS.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active === i
                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                : "bg-white/5 text-[var(--ink-soft)] hover:bg-white/10 hover:text-[var(--ink)]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* terminal, keyed so switching tabs replays the typing animation */}
      <Terminal key={tab.id} title={tab.title} className="min-h-[280px]">
        {tab.lines.map((line, i) =>
          i === 1 ? (
            <TypingAnimation
              key={i}
              delay={i * 220}
              duration={22}
              className={typeClasses[line.type]}
            >
              {line.text || " "}
            </TypingAnimation>
          ) : (
            <AnimatedSpan key={i} delay={i * 220} className={typeClasses[line.type]}>
              {line.text || " "}
            </AnimatedSpan>
          )
        )}
      </Terminal>
    </div>
  )
}
