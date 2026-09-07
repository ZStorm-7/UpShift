import { useState } from "react"
import { motion } from "motion/react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { SectionHeading } from "./ui/SectionHeading"

const FAQS = [
  {
    q: "Do I need editing experience?",
    a: "No. CueFrame is driven by an agent describing intent in plain language — pacing, framing, format. The agent and CueFrame handle the mechanics between them.",
  },
  {
    q: "Which AI tools does CueFrame work with?",
    a: "Claude Code, Claude Desktop, Cursor, Codex, VS Code, ChatGPT, Gemini CLI, Copilot CLI, Windsurf, Cline, Zed, and several others. One command connects any of them.",
  },
  {
    q: "Do I need an API key?",
    a: "No. Your agent opens a browser to authorize on first call, so there is no key to generate, copy, or leak. Claude Code has a paste-in skill, and ChatGPT and Claude Desktop can add CueFrame as a custom connector.",
  },
  {
    q: "How is pricing calculated?",
    a: "Per render, not per seat. Anything up to a minute is $0.50, billed by the output minute after that, rounded up. 720p is half price, 4K counts double. Previews are free, and every new account gets $20 in credit that doesn't expire.",
  },
  {
    q: "Can I still hand off to a human editor?",
    a: "Yes. Any composition exports as a timeline to Premiere Pro or Final Cut Pro, so an agent-built cut is never a dead end.",
  },
]

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-5 sm:px-6">
        <SectionHeading eyebrow="FAQ" title="Common questions" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 border-t border-[var(--border)]"
        >
          {FAQS.map((item, i) => {
            const isOpen = open === i
            return (
              <div key={item.q} className="border-b border-[var(--border)]">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="group flex w-full items-center justify-between gap-5 py-5 text-left"
                >
                  <span
                    className={cn(
                      "text-[16px] font-medium transition-colors sm:text-[17px]",
                      isOpen ? "text-[var(--accent)]" : "text-[var(--ink)]"
                    )}
                  >
                    {item.q}
                  </span>
                  <Plus
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-300",
                      isOpen
                        ? "rotate-45 text-[var(--accent)]"
                        : "text-[var(--ink-dim)] group-hover:text-[var(--ink-soft)]"
                    )}
                  />
                </button>

                <div
                  className={cn(
                    "grid transition-all duration-300 ease-out",
                    isOpen ? "grid-rows-[1fr] pb-6" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="measure pr-8 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                      {item.a}
                    </p>
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
