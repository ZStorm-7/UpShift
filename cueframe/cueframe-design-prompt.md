# CueFrame — Design Reference Prompt

Paste this into Claude Design, Wix Studio, or any other design tool to brief it on the CueFrame marketing site. It describes what exists today (a live Vite + React site) so the tool can recreate, restyle, or extend it accurately.

## What CueFrame is

CueFrame (cueframe.ai) is a video editing API built for AI agents, not humans dragging clips on a timeline. A person describes the edit they want in plain language, an AI agent (Claude Code, Cursor, Codex, VS Code, ChatGPT, Windsurf, Cline, Zed, Codeium, Replit, Amazon Q, Aider, Continue, and more) calls the CueFrame API, and CueFrame renders the finished video. This is a B2D (business-to-developer) / dev-tool product, so the site should read like Vercel, Linear, or Stripe — confident, technical, uncluttered — not like a consumer video app.

Tagline: **"Turn rough footage into finished video."**

## Real product facts (do not invent new claims — reuse these)

- **Repeatable rendering**: the same composition, re-rendered, produces a byte-for-byte identical output every time. Edits are stored as structured data, not manual timeline scrubbing, so a change costs a re-render, not a re-edit.
- **Multi-format output**: one edit automatically reflows to 9:16, 1:1, 16:9, and other aspect ratios instead of manual re-cutting per platform.
- **Dynamic framing**: the camera follows whoever is talking — auto-framed, not a static crop.
- **Export flexibility**: a CueFrame timeline can be exported to Adobe Premiere Pro or Final Cut Pro at any point and finished by hand — no lock-in.
- **File or URL input**: point CueFrame at footage as an upload or just a link.
- **Free previews**: checking an edit costs nothing; you only pay to render the final cut.
- **Pricing**: pay-per-render, no subscription, no seats. $0.50 for renders up to 60 seconds, billed per output minute after that (rounded up). 720p renders are half price, 4K renders count double. New accounts start with $20 in free credit, no card required. Credits don't expire.
- **Agent connection**: one command (`npx -y cueframe install`) authorizes any supported agent tool via a browser popup — no API key to copy around. Also connectable via a Claude Code skill file (`cueframe.ai/skill.md`) or as an MCP connector (`api.cueframe.ai/v1/mcp`).
- **Desktop app**: a native CueFrame app exists for macOS today (13+, Apple Silicon and Intel) for reviewing renders and managing projects without leaving the Mac. Windows support is planned/"coming soon" — never say it's simply unavailable. The API/CLI itself is not platform-restricted; it works from any OS through a supported agent tool.

## Visual identity

**Logo**: a purple gradient lightning-bolt / arrow mark (think a stylized "cue" or forward-motion glyph), used at small sizes in the nav and footer.

**Color system** — warm "espresso and yellow" palette, not the typical cold SaaS blue/purple. Defined as CSS custom properties that flip between a light and dark theme (site defaults to dark on first visit):

- Accent (constant in both themes): `#f4c430` (warm gold/yellow), with a lighter `#ffd966` accent-soft, and `#2c1c10` as the text color used *on* the accent (accent-ink).
- Espresso (constant, always-dark surface color for things like code panels, the pricing header block, and dark CTA panels): `#2c1c10`.
- Light theme: background `#ffffff` with a warm cream secondary `#fdf6e3`, body text `#3b2a1e` (dark brown, not black), soft text `#6b5847`, hairline borders `#ece3d6`.
- Dark theme: background `#0e0b08` (near-black, warm not blue-black), surface `#201709`, body text `#f5ead6` (warm cream, not pure white), soft text `#b9a487`, borders `#33261a`.
- A full-page fixed background gradient runs top to bottom behind every section — espresso fading to white in light mode, warm brown (`#6b4a30`) fading to black in dark mode — so the page reads as one continuous backdrop rather than flat per-section colors, with two soft radial yellow glows layered on top near the hero.

**Typography** — deliberately not a generic AI-template font. Two-family pairing loaded via Google Fonts:

- **Fraunces** (a characterful, editorial serif with an optical-size axis) for every section headline (h1/h2) — weight ~560 regular, up to 700 for bold treatments, occasional italic for accent words. This is what gives the page a crafted, non-generic feel.
- **Hanken Grotesk** (a clean, warm humanist sans) for all body copy and UI chrome — weights 400 through 800.
- Monospace font (system default) used for code/terminal panels, prompt examples, and the editor mockup's inspector panel.

**Tone of voice**: direct, technical, low-hype. Short declarative sentences. Real numbers over vague superlatives ("$0.50 per render" not "affordable pricing"). Prompts and example commands are shown verbatim in quotes to feel concrete.

## Motion and interaction style

Built with the `motion` (Framer Motion successor) library. Consistent patterns across the whole page:

- Section content fades/slides up into place on scroll (`whileInView`, once-only, ~0.4–0.6s ease-out).
- The hero headline uses a custom **glitch/scramble decode effect** — text resolves character-by-character from scrambled symbols into the real words, with a brief RGB-split flicker on settle — triggered right after first paint (no blocking splash screen; content is visible immediately, matching the "no preloader" pattern of clean modern SaaS sites).
- Staggered entrance for grid/list items (each item delayed slightly after the previous).
- Small looping ambient animations inside the editor mockup: a dynamic-framing box drifting side to side, a scrubber line crawling across a waveform, a pulsing "connected" status dot.
- Interactive elements (asset thumbnails, install-method tabs, FAQ accordion) respond to clicks with real state changes, not just hover.
- No heavy parallax or 3D — motion is restrained and purposeful, reinforcing product facts rather than decorating.

## Page structure, section by section (current order)

1. **Navbar** — logo + wordmark left, centered links (How it works / Pricing / FAQ), theme toggle + "Sign in" + "Download" right. Sticky.
2. **Hero** — centered layout (not split two-column): small pill badge ("The professional video editor, built for agents"), large glitch-effect headline ("Turn rough footage into finished video" — second line in accent yellow with a shimmer), subhead paragraph, two CTA buttons ("Start building" primary yellow, "Open in browser" secondary dark), a macOS/Windows availability line, a download button row. Below all of that, a full interactive **editor mockup** (see below) slides up into view.
3. **Editor mockup** (used in Hero and reused elsewhere) — a diffusion.studio-style four-pane fake editor chrome: left media/asset rail with clickable video thumbnails that swap the canvas, center infinite-canvas preview with a dot-grid backdrop and a live dynamic-framing box animation, an AI prompt bar with a real render-processing animation (Reviewing → Assembling → Done), a timeline with waveform and clip blocks, right-side inspector panel (Transform/Effects/Audio) plus a live "agent.compose" code panel.
4. **Showcase** — large full-bleed video showcase frame for one finished render; currently a styled placeholder (dashed border, "Your video goes here") until a real file is dropped in.
5. **LogoMarquee** — infinite horizontal scroll of partner/customer logos.
6. **StorySection × 3** — a repeating pattern: centered eyebrow + headline + description + one text CTA, followed by a large visual underneath. Used for: "Works with the agent you already use" (terminal demo visual, tabbed by agent tool), "One edit, every aspect ratio" (format grid visual showing 9:16/1:1/16:9), "Change one line, not the whole video" (data-panel visual showing the edit-as-data concept).
7. **PromptExamples** — grid of real example prompts shown as terminal-style cards (e.g. `"Cut the intro to 5 seconds"`, `"Export as 9:16, 1:1, and 16:9"`).
8. **UseCases** — four capability-driven cards: social clips from long-form, podcast highlight reels, fast ad variations, docs/product demos.
9. **HowItWorks** — numbered step-by-step process.
10. **FeatureCards** — feature grid.
11. **Stats** — big stat callouts: $0.50, 4K, 10+, $20.
12. **MiniFeatures** — four small clickable cards (byte-for-byte repeatable, file or URL, free previews, export to Premiere/Final Cut) that each jump down to...
13. **FeaturePreviews** — four matching blank preview slots (dashed placeholder boxes) waiting for real screenshots/recordings.
14. **MacSection** — macOS desktop app callout with download CTA.
15. **ComparisonTable** — "Traditional editing" vs "CueFrame" side-by-side table across 6 rows (pricing, re-running an edit, multi-format, speaker framing, who drives it, exporting).
16. **Pricing** — single centered pricing card, espresso-dark header block showing "$0.50 / render," bulleted inclusions below, "Claim $20 free credit" CTA.
17. **FAQ** — accordion.
18. **InstallSection** — tabbed install methods (CLI / Claude Code skill / MCP connector) shown as a live terminal-style panel.
19. **Footer** — links + social.

## What to preserve if redesigning

- The warm espresso/cream/gold palette — this is the single most distinctive brand signal; don't drift toward generic blue/purple SaaS colors.
- The Fraunces-serif-headline + grotesk-sans-body pairing — this is what makes the page feel designed rather than templated.
- Dark-by-default theme with a working light mode.
- The interactive editor mockup as the hero's centerpiece — it's the product demo, not decoration.
- All stated facts and prices above verbatim — do not round, embellish, or invent new features/numbers.
- Restrained, purposeful motion over decorative animation.
