import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const GLITCH_CHARS = "!<>-_\\/[]{}—=+*^?#$%&"

interface GlitchTextProps {
  text: string
  className?: string
  /** ms after `trigger` becomes true before this block starts decoding —
   * lets multiple blocks stagger. */
  delay?: number
  /** ms it takes fully-scrambled text to resolve into the real text. */
  duration?: number
  /** Gate the decode — stays fully scrambled (and invisible under a
   * parent's opacity:0) until this flips true. Defaults to true, so the
   * effect runs immediately on mount if the caller doesn't need to
   * coordinate it with something else (like an intro loader finishing). */
  trigger?: boolean
}

/**
 * A terminal/hacker-style "decode" reveal: the text starts fully scrambled
 * and characters lock into place left to right, with a brief RGB-split
 * glitch flicker the instant it finishes settling.
 */
export function GlitchText({
  text,
  className,
  delay = 0,
  duration = 700,
  trigger = true,
}: GlitchTextProps) {
  const [display, setDisplay] = useState(() => scramble(text, 0))
  const [flicker, setFlicker] = useState(false)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    if (!trigger) return

    let raf: number
    let startTime: number | null = null
    const startTimeout = setTimeout(() => {
      const tick = (t: number) => {
        if (startTime === null) startTime = t
        const elapsed = t - startTime
        const progress = Math.min(1, elapsed / duration)
        // reveal characters left-to-right, a little ahead of linear so it
        // feels like it's "catching up" rather than crawling
        const revealCount = Math.floor(progress * text.length * 1.15)
        setDisplay(scramble(text, revealCount))
        if (progress < 1) {
          raf = requestAnimationFrame(tick)
        } else {
          setDisplay(text)
          setFlicker(true)
          setTimeout(() => setFlicker(false), 260)
        }
      }
      raf = requestAnimationFrame(tick)
    }, delay)

    return () => {
      clearTimeout(startTimeout)
      cancelAnimationFrame(raf)
      cancelAnimationFrame(frameRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay, duration, trigger])

  return (
    <span className={cn("relative inline-block", flicker && "glitch-flicker", className)}>
      {display}
    </span>
  )
}

function scramble(text: string, revealCount: number): string {
  return text
    .split("")
    .map((char, i) => {
      if (char === " ") return " "
      if (i < revealCount) return char
      return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
    })
    .join("")
}
