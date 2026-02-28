'use client';
import { LetheHero } from "@/components/LetheHero";
import { FeatureGrid } from "@/components/FeatureGrid";
import { LiveStatsSection } from "@/components/LiveStatsSection";
import { TechnologySection } from "@/components/TechnologySection";
import { CommunitySection } from "@/components/CommunitySection";

export default function Home() {
  return (
    <div className="min-h-screen">
      <div className="relative z-10">
        <LetheHero />
        <FeatureGrid />
        <LiveStatsSection />
        <TechnologySection />
        <CommunitySection />
      </div>
    </div>
  );
}
