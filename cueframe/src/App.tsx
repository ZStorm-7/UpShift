import { useEffect, useState } from "react"
import { MotionConfig } from "motion/react"
import { Navbar } from "./components/Navbar"
import { Hero } from "./components/Hero"
import { LogoMarquee } from "./components/LogoMarquee"
import { HowItWorks } from "./components/HowItWorks"
import { Capabilities } from "./components/Capabilities"
import { ShowcaseGallery } from "./components/ShowcaseGallery"
import { ComparisonTable } from "./components/ComparisonTable"
import { Pricing } from "./components/Pricing"
import { FAQ } from "./components/FAQ"
import { InstallSection } from "./components/InstallSection"
import { DesktopPage } from "./components/DesktopPage"
import { DevelopersPage } from "./components/DevelopersPage"
import { Footer } from "./components/Footer"

type Route = "home" | "desktop" | "developers"

function routeFromHash(hash: string): Route {
  if (hash.startsWith("#/desktop")) return "desktop"
  if (hash.startsWith("#/developers")) return "developers"
  return "home"
}

function App() {
  // No splash screen — content is visible immediately. This just delays the
  // entrance transition by one frame so the initial -> animate states
  // actually have something to interpolate between, instead of mounting
  // pre-animated.
  const [heroReady, setHeroReady] = useState(false)
  const [route, setRoute] = useState<Route>(() =>
    typeof window === "undefined" ? "home" : routeFromHash(window.location.hash)
  )

  useEffect(() => {
    const raf = requestAnimationFrame(() => setHeroReady(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Lightweight hash router: "/desktop" and "/developers" swap in a full
  // page; every other hash (including the home page's in-page anchors like
  // "#/pricing" or "#get-started") stays on the home route and just scrolls
  // to the matching section id.
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash
      const next = routeFromHash(hash)
      setRoute(next)
      window.scrollTo({ top: 0 })
      if (next === "home") {
        const id = hash.replace(/^#\/?/, "")
        if (id) {
          requestAnimationFrame(() =>
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
          )
        }
      }
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen">
      <Navbar />
      <main>
        {route === "desktop" && <DesktopPage />}
        {route === "developers" && <DevelopersPage />}
        {route === "home" && (
          <>
            <Hero ready={heroReady} />
            <LogoMarquee />
            <HowItWorks />
            <Capabilities />
            <ShowcaseGallery />
            <ComparisonTable />
            <Pricing />
            <FAQ />
            <InstallSection />
          </>
        )}
      </main>
      <Footer />
    </div>
    </MotionConfig>
  )
}

export default App
