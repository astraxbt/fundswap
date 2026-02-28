"use client";

import { useEffect, useState, useRef } from "react";
import { Home, ChevronRight, Menu, X } from "lucide-react";
import Link from "next/link";

export default function GuidePage() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sectionRefs = {
    "getting-started": useRef<HTMLDivElement>(null),
    "basic-usage": useRef<HTMLDivElement>(null),
    "shield": useRef<HTMLDivElement>(null),
    "private-send-sender": useRef<HTMLDivElement>(null),
    "private-send-receiver": useRef<HTMLDivElement>(null),
    "unshield": useRef<HTMLDivElement>(null),
    "faq": useRef<HTMLDivElement>(null),
  };

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    // Close sidebar on mobile after selection
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
    const element = sectionRefs[sectionId as keyof typeof sectionRefs]?.current;
    if (element) {
      const yOffset = -80; // Offset to account for any fixed headers
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  // Update active section based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100;
      
      for (const sectionId in sectionRefs) {
        const section = sectionRefs[sectionId as keyof typeof sectionRefs]?.current;
        if (section) {
          const offsetTop = section.offsetTop;
          const offsetHeight = section.offsetHeight;
          
          if (
            scrollPosition >= offsetTop &&
            scrollPosition < offsetTop + offsetHeight
          ) {
            setActiveSection(sectionId);
          }
        }
      }
    };
    
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="flex min-h-screen relative">
      {/* Mobile Sidebar Toggle Button */}
      <button 
        className="fixed top-4 left-4 z-50 p-2 rounded-md bg-zinc-800/90 md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
      >
        {sidebarOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Menu className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Sidebar - Fixed positioning for mobile, static for desktop */}
      <aside 
        className={`fixed md:sticky top-0 h-screen z-40 bg-zinc-900/90 backdrop-blur-md border-r border-zinc-800 overflow-y-auto transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'left-0' : '-left-64 md:left-0'} w-64`}
        style={{ height: '100vh' }}
      >
        <div className="p-6 pt-16 md:pt-6">
          <Link 
            href="/" 
            className="flex items-center mb-8 group transition-all duration-300"
          >
            <Home className="w-5 h-5 mr-2 text-white/80 group-hover:text-white" />
            <span className="font-medium text-white/80 group-hover:text-white">Home</span>
          </Link>
          
          <h2 className="text-xl font-bold mb-6 font-english">Guide</h2>
          
          <nav className="space-y-1">
            {[
              { id: "getting-started", label: "Getting Started" },
              { id: "basic-usage", label: "Basic Usage" },
              { id: "shield", label: "Shield" },
              { id: "private-send-sender", label: "Private Send - Sender" },
              { id: "private-send-receiver", label: "Private Send - Receiver" },
              { id: "unshield", label: "Unshield" },
              { id: "faq", label: "FAQ" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`w-full text-left py-2 px-4 rounded-md flex items-center transition duration-200 ${
                  activeSection === item.id
                    ? "bg-zinc-800/80 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/40"
                }`}
              >
                {activeSection === item.id && (
                  <ChevronRight className="w-4 h-4 mr-2" />
                )}
                <span className={activeSection === item.id ? "ml-0" : "ml-6"}>
                  {item.label}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 transition-all duration-300 z-10">
        <div className="max-w-5xl mx-auto px-4 py-12 md:px-8">
          {/* Getting Started Section */}
          <section 
            ref={sectionRefs["getting-started"]} 
            className="mb-24"
            id="getting-started"
          >
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold mb-6 font-english">Welcome to Lethe</h1>
              <div className="max-w-2xl mx-auto">
                <p className="text-zinc-300 leading-relaxed">
                  Welcome to Lethe! We've prepared a quick guide for you that we hope you find helpful. We go over the basics of how Lethe works, our three core functionalities, and we have a FAQ for any questions that may arise. We hope you enjoy using us!
                </p>
              </div>
            </div>
            
            <div className="bg-zinc-900/50 rounded-xl p-8 backdrop-blur-sm border border-zinc-800">
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-white">Tl;Dr</h3>
                  <p className="text-zinc-300">
                    Too long? Don't want to read? Here's the important info:
                  </p>
                  <ul className="list-disc pl-5 text-zinc-300 space-y-1">
                    <li>Lethe brings on-chain privacy back to Solana, leveraging ZK technology to keep you, and your funds, safe</li>
                    <li>We offer three main functionalities: Shield (Hide your balance), Send (Send Sol privately), and Unshield (Withdraw your Sol, whenever you want, with complete privacy) </li>
                    <li>We're bringing back privacy, on-chain</li>
                  </ul>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-white">I'm not a criminal, why do I care?</h3>
                  <p className="text-zinc-300">
                    Privacy is more important for regular individuals than for criminals, here's why:
                  </p>
                  <ol className="list-disc pl-5 text-zinc-300 space-y-2">
                    <li>Having large balances on-chain puts you at risk </li>
                    <li>Scammers can target your wallet with fraudulent tokens, targeted phishing attacks, and make you an easy target on-chain </li>
                    <li>Criminals can attempt to tie your wallet to your social media, attempt to dox you, and then try to rob/kidnap/extort you IRL</li>
                    <li>"Friends" can keep tabs on you on-chain, waiting till you have enough for them to try to social engineer you vector</li>
                  </ol>
                </div>
              </div>
            </div>
          </section>

          {/* Basic Usage Section */}
          <section 
            ref={sectionRefs["basic-usage"]} 
            className="mb-24"
            id="basic-usage"
          >
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold mb-6 font-english">Basic Use</h1>
              <div className="max-w-2xl mx-auto">
                <p className="text-zinc-300 leading-relaxed">
                  Understand how to get around our site
                </p>
              </div>
            </div>
            
            <div className="bg-zinc-900/50 rounded-xl p-8 backdrop-blur-sm border border-zinc-800">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="inline-block bg-zinc-800/80 rounded-full px-3 py-1 text-sm font-semibold text-zinc-300 mb-2">
                    Core Functionalities
                  </div>
                  <h3 className="text-xl font-semibold">Private Send and Shield</h3>
                  <p className="text-zinc-300">
                    Shield and Send your sol, privately. Our Shield function allows you to hide your on chain balance by Shielding into a priavte pool, making it invisible to prying eyes. Your private balance doesn't show up on Solscan, nor can anyone see what you do within the private pool. Private Sends allow you to send money to anyone, without anyone being able to see who you sent to, or who sent to you.  
                  </p>
                </div>
                
                <div className="space-y-4">
                  <div className="inline-block bg-zinc-800/80 rounded-full px-3 py-1 text-sm font-semibold text-zinc-300 mb-2">
                    How is All This Possible?
                  </div>
                  <h3 className="text-xl font-semibold">We're Built On The Best</h3>
                  <p className="text-zinc-300">
                    We built our product on top of the leading ZK (Zero-Knowledge) tech protocol on Solana, Light. We utilize their ZK technology to make sure that nobody can see what you do with your funds when they are inside the pool -- not even us
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Shield Section */}
          <section 
            ref={sectionRefs["shield"]} 
            className="mb-24"
            id="shield"
          >
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold mb-6 font-english">Shield</h1>
              <div className="max-w-2xl mx-auto">
                <p className="text-zinc-300 leading-relaxed">
                  Shield, simply 
                </p>
              </div>
            </div>
            
            <div className="bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800">
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="p-8">
                  <h3 className="text-2xl font-semibold mb-4">How Shield Works</h3>
                  <div className="space-y-4 text-zinc-300">
                    <p>
                      Our Shield function allows you to mask your wallet balance, you deposit the Sol you want to hide into our private pool, allowing you to Unshield (withdraw) or Privately Send funds later—without anyone being able to trace it back to your original wallet
                    </p>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>Connect your wallet</li>
                      <li>Navigate to the Shield tab</li>
                      <li>Enter how much Sol you would like to Shield</li>
                      <li>Press "Shield SOL", and approve the transaction</li>
                    </ol>
                    <p>
                      You can view your Shielded balance at any time by going to the Unshield tab, where your funds will show up in your Private Balance. Nobody can view or interact with your Private Balance other than you. Once shielded, your assets remain protected until you choose to send or unshield them, masking your true net worth, and allowing the outside world to only see as much as you let them. 
                    </p>
                  </div>
                </div>
                
                <div className="bg-zinc-950/50 flex items-center justify-center">
                  <div className="aspect-video w-full p-4">
                    <div className="relative w-full h-full">
                      <iframe
                        src="https://player.vimeo.com/video/1061139267?h=910b808a78&amp;badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479"
                        className="absolute top-0 left-0 w-full h-full rounded-lg"
                        frameBorder="0"
                        allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                        title="Shield Demo"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Private Send - Sender Section */}
          <section 
            ref={sectionRefs["private-send-sender"]} 
            className="mb-24"
            id="private-send-sender"
          >
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold mb-6 font-english">Private Send - Sender</h1>
              <div className="max-w-2xl mx-auto">
                <p className="text-zinc-300 leading-relaxed">
                  An easy guide on using our Private Send feature
                </p>
              </div>
            </div>
            
            <div className="bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800">
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="p-8">
                  <div className="inline-block bg-zinc-800/80 rounded-full px-3 py-1 text-sm font-semibold text-zinc-300 mb-4">
                    Private Send - Senders
                  </div>
                  <h3 className="text-2xl font-semibold mb-4">How Private Send Works</h3>
                  <div className="space-y-4 text-zinc-300">
                    <p>
                      Private Send enables you to transfer assets without revealing your identity or transaction details on the public ledger. When you send a Private Send, the contract uses ZK technology to break the link between sender and receiver, allowing private payments, gifts, or transfers 
                    </p>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>Connect Your Wallet</li>
                      <li>Navigate to the Send tab</li>
                      <li>Specify the amount to send</li>
                      <li>Enter the recipients destination address</li>
                      <li>Press "Send Private Transaction", and confirm the transaction</li>
                      <li>** Please ensure that the recipient address has at least 0.01 Sol in it or they won't be able to Unshield (gas fees) **</li>
                    </ol>
                    <p>
                      Your recipient will be able to view their funds when they connect to the site and press the Unshield tab. The funds will be in their private balance, available to Unshield whenever they would like
                    </p>

                  </div>
                </div>
                
                <div className="bg-zinc-950/50 flex items-center justify-center">
                  <div className="aspect-video w-full p-4">
                    <div className="relative w-full h-full">
                      <iframe
                        src="https://player.vimeo.com/video/1061139759?h=fd4d547d82&amp;badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479"
                        className="absolute top-0 left-0 w-full h-full rounded-lg"
                        frameBorder="0"
                        allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                        title="Private Send Demo"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Private Send - Receiver Section */}
          <section 
            ref={sectionRefs["private-send-receiver"]} 
            className="mb-24"
            id="private-send-receiver"
          >
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold mb-6 font-english">Private Send - Receiver</h1>
              <div className="max-w-2xl mx-auto">
                <p className="text-zinc-300 leading-relaxed">
                  Here's how you can see and withdraw funds sent to you through Lethe
                </p>
              </div>
            </div>
            
            <div className="bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800">
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="p-8">
                  <div className="inline-block bg-zinc-800/80 rounded-full px-3 py-1 text-sm font-semibold text-zinc-300 mb-4">
                    Private Send - Receiver
                  </div>
                  <h3 className="text-2xl font-semibold mb-4">Receiving Private Transactions</h3>
                  <div className="space-y-4 text-zinc-300">
                    <p>
                      As the recipient of a Private Send, viewing and withdrawing your balance is simple
                    </p>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>When notified of an incoming private transaction, open our site and connect your wallet</li>
                      <li>Navigate to the Unshield tab</li>
                      <li>Your Available Private Balance will be shown there</li>
                      <li>To withdraw, enter however much of your balance you would like to and press Unshield SOL</li>
                      <li>You can withdraw as much or as little of your balance as you would like, whenever you would like. Balances don't expire</li>
                    </ol>
                  </div>
                </div>
                
                <div className="bg-zinc-950/50 flex items-center justify-center">
                  <div className="aspect-video w-full p-4">
                    <div className="relative w-full h-full">
                      <iframe
                        src="https://player.vimeo.com/video/1061141195?h=0cd72ae62a&amp;badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479"
                        className="absolute top-0 left-0 w-full h-full rounded-lg"
                        frameBorder="0"
                        allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                        title="Private Receive Demo"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Unshield Section */}
          <section 
            ref={sectionRefs["unshield"]} 
            className="mb-24"
            id="unshield"
          >
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold mb-6 font-english">Unshield</h1>
              <div className="max-w-2xl mx-auto">
                <p className="text-zinc-300 leading-relaxed">
                  Convert your shielded assets back whenever you need.
                </p>
              </div>
            </div>
            
            <div className="bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800">
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="p-8">
                  <div className="inline-block bg-zinc-800/80 rounded-full px-3 py-1 text-sm font-semibold text-zinc-300 mb-4">
                    The easiest part!
                  </div>
                  <h3 className="text-2xl font-semibold mb-4">How Unshielding Works</h3>
                  <div className="space-y-4 text-zinc-300">
                    <p>
                      If you need your funds in a hurry, the Unshield process is easy and straightforward
                    </p>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>Connect your wallet</li>
                      <li>Navigate to the Unshield tab</li>
                      <li>Enter the amount you would like to Unshield</li>
                      <li>Press "Unshield SOL", and confirm the transaction</li>
                      <li>You can Unshield as much or as little of your private balance as you want, whenever you want</li>
                    </ol>
                    <p>
                      Once unshielded, the unshielded assets will appear again on Solscan, visible to the world. 
                    </p>  
                  </div>
                </div>
                
                <div className="bg-zinc-950/50 flex items-center justify-center">
                  <div className="aspect-video w-full p-4">
                    <div className="relative w-full h-full">
                      <iframe
                        src="https://player.vimeo.com/video/1061141569?h=62d5e0c8bc&amp;badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479"
                        className="absolute top-0 left-0 w-full h-full rounded-lg"
                        frameBorder="0"
                        allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                        title="Unshield Demo"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <section 
            ref={sectionRefs["faq"]} 
            className="mb-24"
            id="faq"
          >
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold mb-6 font-english">Frequently Asked Questions</h1>
              <div className="max-w-2xl mx-auto">
                <p className="text-zinc-300 leading-relaxed">
                  Answering the most common questions we get!
                </p>
              </div>
            </div>
            
            <div className="bg-zinc-900/50 rounded-xl p-8 backdrop-blur-sm border border-zinc-800">
              <div className="space-y-8">
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold">Who owns the keys to the pool? Are my funds safe?</h3>
                  <p className="text-zinc-300">
                    Nobody owns the keys to the pool, it is a smart contract on Solana. Your funds cannot be seen or moved by anyone other than you thanks to the amazing ZK technology we leverage. 
                  </p>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold">Do I have to Unshield my entire Private Balance at once? Or is there a time limit??</h3>
                  <p className="text-zinc-300">
                    No, and no! You can unshield as little or as much as you want of your private balance, whenever you want. You can wait 5 minutes, a day, or even a year, but the only person who will ever be able to touch those funds is you. 
                  </p>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold">How long does the shielding/sending/unshielding process take?</h3>
                  <p className="text-zinc-300">
                     All of our processes take as long as a normal transaction on Solana does - almost instantaneouly!
                  </p>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold">I did a Private Send to the wrong address, can anyone help??</h3>
                  <p className="text-zinc-300">
                    Private Send transactions once sent cannot be viewed by anyone other than the recipient. We reccomend that you double check your destination address before sending, as we cannot help if you mistype
                  </p>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold">Are there fees? Why do you have a token?</h3>
                  <p className="text-zinc-300">
                    Yes, currently there is a 0.1% fee on our site. That fee goes directly into buybacks and burns of our token, $lethe. We are working on adding more token utility - we envision that in the future our site will charge fees in $lethe, 100% of which will be airdropped to token holders.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
