"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

interface AnimatedSpanProps {
  children: React.ReactNode
  delay?: number
  className?: string
}

/** A single terminal line that fades/slides in after `delay` ms. */
export function AnimatedSpan({ children, delay = 0, className }: AnimatedSpanProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      className={cn("grid text-sm font-normal tracking-tight", className)}
    >
      {children}
    </motion.div>
  )
}

interface TypingAnimationProps {
  children: string
  className?: string
  duration?: number
  delay?: number
}

/** A single line that types itself out character by character. */
export function TypingAnimation({
  children,
  className,
  duration = 40,
  delay = 0,
}: TypingAnimationProps) {
  const [displayed, setDisplayed] = useState("")
  const [started, setStarted] = useState(false)

  useEffect(() => {
    setDisplayed("")
    setStarted(false)
    const startTimeout = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(startTimeout)
  }, [children, delay])

  useEffect(() => {
    if (!started) return
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayed(children.slice(0, i))
      if (i >= children.length) clearInterval(interval)
    }, duration)
    return () => clearInterval(interval)
  }, [started, children, duration])

  return (
    <span className={cn("text-sm font-normal tracking-tight", className)}>
      {displayed}
      {started && displayed.length < children.length && (
        <span className="animate-blink">▍</span>
      )}
    </span>
  )
}

interface TerminalProps {
  children: React.ReactNode
  className?: string
  title?: string
}

/** macOS-style terminal window chrome wrapping typed/animated lines. */
export function Terminal({ children, className, title = "zsh" }: TerminalProps) {
  return (
    <div
      className={cn(
        "h-full w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--espresso)] shadow-[0_20px_60px_-20px_var(--shadow-tint)]",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/20 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-xs font-medium text-white/50">{title}</span>
      </div>
      <pre className="overflow-auto p-4">
        <code className="grid gap-1.5 font-mono text-[#e8d9c2]">{children}</code>
      </pre>
    </div>
  )
}
