'use client';
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { 
  ArrowLeftRight, 
  Coins
} from "lucide-react";

const features = [
  {
    title: "Fund",
    description: "Anonymous Wallet Funding",
    icon: Coins,
    link: "/Dashboard/Fund"
  },
  {
    title: "Swap",
    description: "Private Token Swapping",
    icon: ArrowLeftRight,
    link: "/Dashboard/swap"
  }
];

export function FeatureGrid() {
  return (
    <div className="px-6 py-16 max-w-7xl mx-auto">      
      <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto">
        {features.map((feature) => (
          <Link key={feature.title} href={feature.link}>
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
              </CardContent>
              <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
