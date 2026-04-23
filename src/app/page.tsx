import { AmbientField } from "@/components/landing/ambient-field";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ScenarioPicker } from "@/components/landing/scenario-picker";
import { TopNav } from "@/components/landing/top-nav";
import { TrustStrip } from "@/components/landing/trust-strip";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <AmbientField />
      <TopNav />
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <ScenarioPicker />
      <Footer />
    </div>
  );
}
