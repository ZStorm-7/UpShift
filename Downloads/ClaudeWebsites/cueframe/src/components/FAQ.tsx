import { useState } from "react"
import { motion } from "motion/react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const FAQS = [
  {
    q: "Do I need editing experience to use CueFrame?",
    a: "No. CueFrame is designed to be driven by an AI agent describing intent in plain language — pacing, framing, format. The agent (and CueFrame) handles the mechanics.",
  },
  {
    q: "Which AI tools does CueFrame work with?",
    a: "Claude Code, Claude Desktop, Cursor, Codex, VS Code, ChatGPT, Gemini CLI, Copilot CLI, Windsurf, Cline, Zed, and several others — one command connects any of them so they can compose and render.",
  },
  {
    q: "Do I need an API key?",
    a: "No. Your agent opens a browser to authorize on first call — there's no key to generate, copy, or leak. Claude Code has a paste-in skill, and ChatGPT and Claude Desktop can add CueFrame as a custom connector.",
  },
  {
    q: "What if I don't have footage yet?",
    a: "You don't need any. Give CueFrame a brief instead of raw footage and it can produce the video from licensed stock — useful when you're moving faster than you can film.",
  },
  {
    q: "How is pricing calculated?",
    a: "You pay per render, not per seat. Anything up to a minute is $0.50, billed by the output minute after that (rounded up) — a 3-minute cut is $1.50. 720p is half price, 4K counts double, and transcription costs pennies. Checking an edit is free: previews don't count against your render cost. Every new account gets $20 in free credit that doesn't expire.",
  },
  {
    q: "Can I still hand off to a human editor?",
    a: "Yes — any composition can be exported as a timeline to Premiere Pro or Final Cut Pro, so agent-built cuts are never a dead end.",
  },
  {
    q: "Will re-running the same edit produce the same video?",
    a: "Yes. Because edits are stored as data rather than manual scrub-and-cut, rendering the same composition again reproduces the same output byte-for-byte.",
  },
  {
    q: "What platforms does the CueFrame app run on?",
    a: "The CueFrame desktop app is available for macOS today, with Windows support coming soon. The API and CLI (what your agent actually calls to compose and render) aren't platform-restricted, so Claude Code, Cursor, VS Code, and the rest work the same regardless of your OS in the meantime.",
  },
]

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="bg-[var(--bg-2)]/55 py-28">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">
            FAQ
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
            Common questions
          </h2>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
          className="mt-12 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
        >
          {FAQS.map((item, i) => {
            const isOpen = open === i
            return (
              <div key={item.q}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="font-medium text-[var(--ink)]">{item.q}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-[var(--ink-soft)] transition-transform",
                      isOpen && "rotate-180 text-[var(--accent)]"
                    )}
                  />
                </button>
                <div
                  className={cn(
                    "grid transition-all duration-300 ease-in-out",
                    isOpen ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden px-6">
                    <p className="text-sm leading-relaxed text-[var(--ink-soft)]">{item.a}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
