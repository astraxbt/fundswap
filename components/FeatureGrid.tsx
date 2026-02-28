'use client';
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { 
  Zap, 
  Vault, 
  ArrowLeftRight, 
  Send, 
  Shield, 
  Coins,
  FileText, 
  Info,
  Map
} from "lucide-react";

const features = [
  {
    title: "Vault",
    description: "Secure Token Vault",
    icon: Vault,
    comingSoon: false,
    link: "/Dashboard/vault"
  },
  {
    title: "Bridge",
    description: "Instant Cross-Chain Bridge",
    icon: Zap,
    comingSoon: false,
    link: "/Dashboard/Bridge"
  },
  {
    title: "Fund",
    description: "Anonymous Wallet Funding",
    icon: Coins,
    comingSoon: false,
    link: "/Dashboard/Fund"
  },
  {
    title: "Transfer",
    description: "Private Token Transfers",
    icon: Send,
    comingSoon: false,
    link: "/Dashboard/send"
  },
  {
    title: "Swap",
    description: "Private Token Swapping",
    icon: ArrowLeftRight,
    comingSoon: false,
    link: "/Dashboard/swap"
  },
  {
    title: "Stealth Addresses",
    description: "Private Payment Gateway",
    icon: Shield,
    comingSoon: false,
    link: "/Dashboard/stealth"
  },
  {
    title: "Roadmap",
    description: "Development Timeline",
    icon: Map,
    comingSoon: false,
    link: "/todo"
  },
  {
    title: "Analytics",
    description: "Lethe Analytics",
    icon: Info,
    comingSoon: true
  },
  {
    title: "Docs",
    description: "Technical Documentation",
    icon: FileText,
    comingSoon: true
  },
  {
    title: "API",
    description: "Lethe Apis",
    icon: Info,
    comingSoon: true
  }
];

export function FeatureGrid() {
  return (
    <div className="px-6 py-16 max-w-7xl mx-auto">      
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {features.map((feature) => {
          const cardContent = (
            <Card 
              className="bg-surface-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-card cursor-pointer group relative overflow-hidden h-full"
            >
              <CardContent className="p-6 flex flex-col items-center text-center space-y-4 relative z-10 h-full">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-300">
                  <feature.icon className="h-7 w-7 text-primary" />
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <h3 className="font-semibold text-foreground mb-2 text-lg">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
                {feature.comingSoon && (
                  <span className="absolute top-3 right-3 text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">
                    Soon
                  </span>
                )}
              </CardContent>
              <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
            </Card>
          );

          return feature.link ? (
            <Link key={feature.title} href={feature.link}>
              {cardContent}
            </Link>
          ) : (
            <div key={feature.title}>
              {cardContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
