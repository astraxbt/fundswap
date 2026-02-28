'use client';
import React from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, TrendingUp, Copy } from "lucide-react";
import Link from "next/link";

export function LetheHero() {
  const contractAddress = "HEZ6KcNNUKaWvUCBEe4BtfoeDHEHPkCHY9JaDNqrpump";
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(contractAddress);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center px-6 py-20">
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-glow opacity-30 blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-gradient-glow opacity-20 blur-3xl" />
      
      <div className="max-w-7xl mx-auto flex flex-col md:grid md:grid-cols-2 gap-6 md:gap-8 lg:gap-12 items-center">
        <div className="space-y-4 md:space-y-6 lg:space-y-8 order-2 md:order-1">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              Model Active
            </div>
            
            <h1 className="text-2xl sm:text-4xl md:text-6xl lg:text-7xl font-bold tracking-wider">
              Coeus
            </h1>
            
            <p className="text-sm sm:text-lg md:text-xl text-muted-foreground max-w-md">
              Cutting edge model predictions blending sports and crypto 
            </p>
          </div>

          <div className="bg-surface-card border border-border rounded-lg p-2 md:p-4 font-mono text-xs md:text-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-primary font-semibold">$Coeus</span>
            </div>
            <div className="text-muted-foreground text-xs">
              Contract: 
              <button 
                onClick={copyToClipboard}
                className="text-primary hover:text-primary/80 transition-colors cursor-pointer inline-flex items-center gap-1 bg-transparent border-none px-1 py-0.5 font-mono text-xs rounded hover:bg-primary/10 ml-1"
                title="Click to copy contract address"
              >
                <span className="select-none break-all">{contractAddress}</span>
                <Copy className="h-3 w-3 flex-shrink-0" />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button 
              size="lg" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow transition-all duration-300 hover:shadow-glow/70"
              asChild
            >
              <Link href="/Dashboard">
                Launch App
              </Link>
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              className="bg-black border-primary/50 text-primary hover:bg-black/80 transition-all duration-300"
              asChild
            >
              <a 
                href="https://dexscreener.com/solana/amme84klt1yzpz8akyjjtwd26hesaj5fblg6tew2rxcx"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Chart
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>

        <div className="relative flex items-center justify-center order-1 md:order-2">
          <div className="w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 bg-gradient-primary/20 rounded-full flex items-center justify-center animate-pulse">
            <img 
              src="/password.svg" 
              alt="Lethe Logo" 
              className="w-36 h-36 sm:w-48 sm:h-48 md:w-60 md:h-60 lg:w-72 lg:h-72"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
