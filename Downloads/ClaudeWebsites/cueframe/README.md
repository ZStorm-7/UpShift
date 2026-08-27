# CueFrame landing page

Vite + React + TypeScript + Tailwind v4 + Motion (framer-motion successor) + lucide-react icons.

## Run it

```bash
npm install
npm run dev
```

## What's inside

- `src/components/Hero.tsx` — headline, CTA, mounts the editor mock
- `src/components/EditorMock.tsx` — the fake "editor" UI (preview, dynamic-framing box, waveform, timeline clips, agent code panel) — this is the visual centerpiece
- `src/components/LogoMarquee.tsx` — scrolling row of supported AI tools (magicui-style Marquee, `src/components/ui/Marquee.tsx`)
- `src/components/Features.tsx` — bento-style feature grid using a spotlight-hover card (reactbits-style, `src/components/ui/SpotlightCard.tsx`)
- `src/components/HowItWorks.tsx`, `Pricing.tsx`, `FAQ.tsx` (animated accordion), `CTA.tsx`, `Footer.tsx`, `Navbar.tsx`

## Palette

Set as CSS variables in `src/index.css`:
- `--bg-1` white, `--bg-2` warm cream — light gradient background
- `--accent` `#f4c430` yellow highlight
- `--espresso` `#2c1c10` dark espresso brown (used for the dark UI surfaces, primary buttons' text-on-yellow, code panel, CTA/pricing panel backgrounds)

Swap these three variables to retint the whole site.

## Dropping into your existing repo

Your existing `App.tsx` already had `Terminal`/`AnimatedSpan`/`TypingAnimation` components and a `cn()` helper at `@/lib/utils` — same conventions used here. Copy `src/components/*`, `src/lib/utils.ts`, and merge `src/index.css` into your project; install `motion`, `lucide-react`, `clsx`, `tailwind-merge` if not already present.
