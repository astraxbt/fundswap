
import React from "react";
import Link from "next/link";
import { ExternalLink, Github, Twitter } from "lucide-react";
import Logo from "@/components/logo";

const Footer = () => {
  return (
    <footer className="relative z-10 border-t border-white/10 pt-12 pb-8 bg-[#0c0c14]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center">
              <div className="flex items-center justify-center w-8 h-8 mr-2">
                <Logo size={32} className="text-white" />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-purple-300">
                Lethe
              </span>
            </Link>
            <p className="mt-4 text-sm text-white/60 leading-relaxed">
              Privacy-preserving protocol for the Solana blockchain.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-4 text-white/80">Features</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/Dashboard/Fund" className="text-sm text-white/60 hover:text-white transition-colors">
                  Anonymous Funding
                </Link>
              </li>
              <li>
                <Link href="/Dashboard/swap" className="text-sm text-white/60 hover:text-white transition-colors">
                  Private Swaps
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-4 text-white/80">Resources</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/learn" className="text-sm text-white/60 hover:text-white transition-colors">
                  Learn
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-4 text-white/80">Socials</h3>
            <ul className="space-y-3">
              <li>
                <a href="https://x.com/LetheSol" target = "_blank" className="text-sm text-white/60 hover:text-white flex items-center transition-colors">
                  <Twitter className="mr-2 h-4 w-4" /> Twitter
                </a>
              </li>
              <li>
                <a href="https://github.com/lethe-sol/lethesol" target = "_blank" className="text-sm text-white/60 hover:text-white flex items-center transition-colors">
                  <Github className="mr-2 h-4 w-4" /> GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
