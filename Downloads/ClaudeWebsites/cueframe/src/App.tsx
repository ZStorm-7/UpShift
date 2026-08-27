import { useEffect, useState } from "react"
import { MotionConfig } from "motion/react"
import { Navbar } from "./components/Navbar"
import { Hero } from "./components/Hero"
import { Showcase } from "./components/Showcase"
import { LogoMarquee } from "./components/LogoMarquee"
import { StorySection } from "./components/StorySection"
import { TerminalDemo } from "./components/TerminalDemo"
import { FormatGrid } from "./components/visuals/FormatGrid"
import { DataPanel } from "./components/visuals/DataPanel"
import { PromptExamples } from "./components/PromptExamples"
import { UseCases } from "./components/UseCases"
import { HowItWorks } from "./components/HowItWorks"
import { FeatureCards } from "./components/FeatureCards"
import { Stats } from "./components/Stats"
import { MiniFeatures } from "./components/MiniFeatures"
import { FeaturePreviews } from "./components/FeaturePreviews"
import { MacSection } from "./components/MacSection"
import { ComparisonTable } from "./components/ComparisonTable"
import { Pricing } from "./components/Pricing"
import { FAQ } from "./components/FAQ"
import { InstallSection } from "./components/InstallSection"
import { Footer } from "./components/Footer"

function App() {
  // No splash screen — content is visible immediately (usecardboard.com has
  // no preloader either). This just delays the entrance transition by one
  // frame so the initial -> animate states actually have something to
  // interpolate between, instead of mounting pre-animated.
  const [heroReady, setHeroReady] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setHeroReady(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen">
      <Navbar />
      <main>
        <Hero ready={heroReady} />
        <Showcase />
        <LogoMarquee />

        <StorySection
          eyebrow="Agent-native"
          title="Works with the agent you already use"
          description={`One command connects Claude Code, Cursor, Codex, VS Code, ChatGPT, and 10+ more. Your agent opens a browser to authorize on first call — there's no API key to copy around.`}
          cta={{ label: "Read the docs", href: "https://docs.cueframe.ai" }}
          visual={<TerminalDemo />}
        />

        <StorySection
          eyebrow="Multi-format"
          title="One edit, every aspect ratio"
          description="9:16, 1:1, 16:9 — CueFrame reflows a single composition instead of making you re-cut for each platform, with the camera dynamically following whoever's talking."
          cta={{ label: "View pricing", href: "#pricing" }}
          visual={<FormatGrid />}
          tone="soft"
        />

        <StorySection
          eyebrow="Edit as data"
          title="Change one line, not the whole video"
          description="Edits are stored as plain, versionable data instead of an opaque project file. A change costs a re-render, not a re-edit — and the same composition always renders byte-for-byte identical."
          cta={{ label: "See how it works", href: "#how-it-works" }}
          visual={<DataPanel />}
        />

        <PromptExamples />
        <UseCases />
        <HowItWorks />
        <FeatureCards />
        <Stats />
        <MiniFeatures />
        <FeaturePreviews />
        <MacSection />
        <ComparisonTable />
        <Pricing />
        <FAQ />
        <InstallSection />
      </main>
      <Footer />
    </div>
    </MotionConfig>
  )
}

export default App
