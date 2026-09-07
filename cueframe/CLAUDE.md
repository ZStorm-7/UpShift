# CueFrame landing page — project context

This file exists so a local Claude Code (terminal) session has full context
without re-deriving it. Read this before making changes.

## What this is

A marketing/landing page for **CueFrame** (cueframe.ai), a video editing API
for AI agents. Real product facts (pulled from the live site, keep these
accurate — don't invent new claims):

- Tagline: "Turn rough footage into finished video"
- Users describe an edit, an AI agent (Claude Code, Cursor, VS Code, ChatGPT,
  Windsurf, Cline, Zed, Codeium, Replit, Amazon Q, Aider, Continue) calls the
  CueFrame API, CueFrame renders the finished video.
- Repeatable rendering: same composition re-run = byte-identical output
  (edits are stored as data, not manual timeline scrubbing).
- Multi-format output: one edit reflows to 9:16, 1:1, 16:9, etc.
- Dynamic framing: camera follows whoever's talking, not a static crop.
- Export flexibility: timelines export to Premiere Pro or Final Cut Pro.
- Pricing: pay-per-render, no subscription. $0.50 for renders up to 60s,
  per-minute billing after that, 4K doubles the cost. New accounts start
  with $20 free credit.
- **Platform**: the CueFrame **desktop app** is macOS-only today; **Windows
  support is planned/coming soon** (don't say "not available" — say "coming
  soon"). The API/CLI itself is not platform-restricted — any OS can call it
  from any of the supported agent tools.

## Stack

Vite + React 19 + TypeScript + Tailwind v4 + `motion` (the framer-motion
successor package, imported as `from "motion/react"`, NOT `framer-motion`) +
`lucide-react` icons. Package manager: **pnpm** (not npm/yarn — use `pnpm
install`, `pnpm dev`, `pnpm build`).

Path alias `@/*` → `./src/*`, configured in both `tsconfig.app.json`
(`compilerOptions.paths`, no `baseUrl` — deprecated in this TS version) and
`vite.config.ts` (`resolve.alias`).

## Design system

All colors are CSS custom properties in `src/index.css`, swapped via
`[data-theme="dark"]` on `<html>`:

- `--accent` / `--accent-soft` / `--accent-ink`: the yellow highlight
  (`#f4c430`) and its dark text-on-yellow color (`#2c1c10`) — constant in
  both themes, this is the one brand color that never flips.
- `--espresso`: dark brown (`#2c1c10`), used for permanently-dark UI
  surfaces (CTA panel, pricing top panel, terminal/code chrome) regardless
  of page theme.
- `--bg-1`, `--bg-2`, `--surface`, `--ink`, `--ink-soft`, `--border`: flip
  between light (white/cream bg, dark brown text) and dark (near-black bg,
  cream text) — these are what `[data-theme="dark"]` overrides.
- `--grad-a` / `--grad-b`: the two ends of the decorative `.bg-mesh`
  background gradient used behind the Hero and CTA sections. **Light mode:
  espresso → white. Dark mode: light brown (`#6b4a30`) → black.** Layered
  with two radial yellow accent glows on top. Don't lose this when editing
  `.bg-mesh` in `index.css`.
- Theme defaults to **dark** on first visit (see the inline script in
  `index.html` and `ThemeToggle.tsx`'s `getInitialTheme`) — only starts in
  light mode if the visitor previously toggled to light (persisted in
  `localStorage` under `cueframe-theme`).

## Component map (`src/components/`)

- **Logo**: the real CueFrame brand mark, `public/favicon.svg` (purple
  gradient lightning-bolt/arrow mark), rendered via `<img src="/favicon.svg"
  alt="CueFrame" />` in `Navbar.tsx` and `Footer.tsx`. Don't invent a new
  mark or revert to a placeholder "C" badge — this is the actual logo
  already shipped in the CueFrame product, just point at `/favicon.svg`.
- `Navbar.tsx` — sticky nav, `ThemeToggle`, "Download" button (`#download`
  anchor → scrolls to the Hero's download row).
- `ThemeToggle.tsx` — sun/moon button, persists to `localStorage`.
- `Hero.tsx` — split two-column layout (not centered/stacked): left =
  headline/CTA/`TerminalDemo`, right = `VideoShowcase`. Has the macOS/Windows
  status line under the top badge.
- `VideoShowcase.tsx` — **placeholder video player** for a real CueFrame
  editor demo recording. To activate: put the file in `public/` (e.g.
  `public/demo.mp4`), then in this component set `hasSource` to `true` and
  uncomment the `src`/`poster` props on the `<video>` tag.
- `TerminalDemo.tsx` + `ui/Terminal.tsx` — tabbed terminal (Claude Code /
  Cursor / ChatGPT / VS Code tabs), each showing that tool's real usage
  snippet with a typing animation. `ui/Terminal.tsx` has the reusable
  `Terminal`, `AnimatedSpan`, `TypingAnimation` primitives (magicui-style,
  rebuilt from scratch to avoid the `motion/react` version-mismatch bugs the
  user hit with an earlier pasted version).
- `DownloadButton.tsx` — "Download for macOS" primary button + "Windows —
  coming soon" pill. Takes an `onDark` prop for use on the always-dark
  espresso CTA panel (`CTA.tsx`) vs the theme-aware default elsewhere.
- `EditorMock.tsx` — the animated fake editor UI (preview, dynamic-framing
  box, waveform, timeline clips, agent code panel). Now lives inside
  `Features.tsx`'s bento grid as a featured tile, not standalone.
- `Features.tsx` — asymmetric bento grid (`Repeatable rendering` and
  `Dynamic framing` and `Export flexibility` span 2 cols on `lg`, others are
  1 col), `EditorMock` as a full-width featured tile at the top.
- `HowItWorks.tsx`, `Pricing.tsx`, `FAQ.tsx`, `CTA.tsx`, `LogoMarquee.tsx`,
  `Footer.tsx` — standard sections, all have `whileInView` scroll-in
  animation (motion) for consistency.
- `ui/SpotlightCard.tsx` — reactbits-style mouse-follow spotlight hover
  card, used by feature tiles.
- `ui/Marquee.tsx` — magicui-style infinite scroll marquee, used by
  `LogoMarquee.tsx`.

## Known-good state

Last verified: `pnpm install && pnpm build` type-checks clean (`tsc -b
--noEmit`) and builds with Vite with no errors. Screenshotted every section
in both themes via headless Chromium — all sections render, all 4 terminal
tabs switch correctly and retrigger their typing animation, the bento grid
and gradient backgrounds render as designed.

## Things intentionally left as placeholders

- `VideoShowcase.tsx` has no real video yet — see instructions above.
- `DownloadButton.tsx`'s `href="#download"` is not a real download link yet
  — point it at the actual `.dmg` (or a redirect URL) when ready.
- Nav/footer links to `#docs`, `Changelog`, `API reference`, `Guides`,
  `Status`, `About`, `Blog`, `Contact` are anchor placeholders, not real
  pages.

## Commands

```bash
pnpm install
pnpm dev       # local dev server
pnpm build     # tsc -b && vite build
pnpm preview   # serve the production build locally
```
