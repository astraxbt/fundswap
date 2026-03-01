'use client';
import { LetheHero } from "@/components/LetheHero";
import { FeatureGrid } from "@/components/FeatureGrid";
import { CommunitySection } from "@/components/CommunitySection";

export default function Home() {
  return (
    <div className="min-h-screen">
      <div className="relative z-10">
        <LetheHero />
        <FeatureGrid />
        <CommunitySection />
      </div>
    </div>
  );
}
