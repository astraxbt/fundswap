'use client';

import WalletConnectButton from "@/components/walletConnectButton";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ChevronDown, Menu, X, Vault, Zap, Coins, Send, ArrowLeftRight, Shield, Map, Info, FileText } from "lucide-react";

const NavBar: React.FC = () => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        const checkScreenSize = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkScreenSize();
        window.addEventListener('resize', checkScreenSize);
        return () => window.removeEventListener('resize', checkScreenSize);
    }, []);

    const navigationItems = [
        {
            title: "Vault",
            description: "Secure Token Vault",
            icon: Vault,
            link: "/Dashboard/vault",
            comingSoon: false
        },
        {
            title: "Bridge",
            description: "Instant Cross-Chain Bridge",
            icon: Zap,
            link: "/Dashboard/Bridge",
            comingSoon: false
        },
        {
            title: "Fund",
            description: "Anonymous Wallet Funding",
            icon: Coins,
            link: "/Dashboard/Fund",
            comingSoon: false
        },
        {
            title: "Transfer",
            description: "Private Token Transfers",
            icon: Send,
            link: "/Dashboard/send",
            comingSoon: false
        },
        {
            title: "Swap",
            description: "Private Token Swapping",
            icon: ArrowLeftRight,
            link: "/Dashboard/swap",
            comingSoon: false
        },
        {
            title: "Stealth Addresses",
            description: "Private Payment Gateway",
            icon: Shield,
            link: "/Dashboard/stealth",
            comingSoon: false
        },
        {
            title: "Roadmap",
            description: "Development Timeline",
            icon: Map,
            link: "/todo",
            comingSoon: false
        },
        {
            title: "Analytics",
            description: "Lethe Analytics",
            icon: Info,
            link: "#",
            comingSoon: true
        },
        {
            title: "Docs",
            description: "Technical Documentation",
            icon: FileText,
            link: "#",
            comingSoon: true
        },
        {
            title: "API",
            description: "Lethe APIs",
            icon: Info,
            link: "#",
            comingSoon: true
        }
    ];

    if (isMobile) {
        return (
            <>
                {/* Minimal mobile navbar - logo + hamburger */}
                <div className="fixed top-0 w-full h-12 z-[1000] bg-background/80 backdrop-blur-sm px-4 flex justify-between items-center">
                    {/* Logo Section */}
                    <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
                        <img src="/password.svg" alt="Lethe Logo" className="w-6 h-6" />
                    </Link>

                    {/* Hamburger Menu */}
                    <button 
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="text-white hover:text-purple-400 transition-colors p-1"
                        aria-label="Toggle menu"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                </div>

                {/* Sidebar navigation overlay */}
                {isMenuOpen && (
                    <>
                        {/* Blurred backdrop */}
                        <div 
                            className="fixed inset-0 z-[1001] bg-black/50 backdrop-blur-sm"
                            onClick={() => setIsMenuOpen(false)}
                        />
                        
                        {/* Sidebar menu */}
                        <div className="fixed top-0 right-0 h-full w-1/3 z-[1002] bg-background/95 backdrop-blur-sm border-l border-white/10 shadow-2xl">
                            {/* Header */}
                            <div className="flex justify-between items-center p-4 border-b border-white/10">
                                <h2 className="text-white text-base font-medium">Navigation</h2>
                                <button 
                                    onClick={() => setIsMenuOpen(false)}
                                    className="text-white hover:text-purple-400 transition-colors p-1"
                                    aria-label="Close menu"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Wallet Connect Section */}
                            <div className="p-4 border-b border-white/10">
                                <WalletConnectButton />
                            </div>

                            {/* Navigation Items */}
                            <div className="p-4 overflow-y-auto max-h-[calc(100vh-80px)]">
                                <div className="space-y-2">
                                    {navigationItems.map((item) => {
                                        const content = (
                                            <div className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-200 ${
                                                item.comingSoon 
                                                    ? 'opacity-50 cursor-not-allowed' 
                                                    : 'hover:bg-purple-600/20 cursor-pointer active:bg-purple-600/30'
                                            }`}>
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                    item.comingSoon 
                                                        ? 'bg-gray-600/20' 
                                                        : 'bg-purple-600/20'
                                                }`}>
                                                    <item.icon className={`w-4 h-4 ${
                                                        item.comingSoon 
                                                            ? 'text-gray-400' 
                                                            : 'text-purple-400'
                                                    }`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center space-x-2">
                                                        <h3 className="text-white font-medium text-[10px] leading-tight">{item.title}</h3>
                                                        {item.comingSoon && (
                                                            <span className="text-[8px] bg-gray-600/30 text-gray-300 px-1 py-0.5 rounded-full flex-shrink-0">
                                                                Soon
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );

                                        return item.link && !item.comingSoon ? (
                                            <Link 
                                                key={item.title} 
                                                href={item.link}
                                                onClick={() => setIsMenuOpen(false)}
                                            >
                                                {content}
                                            </Link>
                                        ) : (
                                            <div key={item.title}>
                                                {content}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </>
        );
    }

    return (
        <div className="fixed top-0 w-full h-16 z-[1000] bg-[#0a0a0e]/80 backdrop-blur-sm px-6 flex justify-between items-center">
            {/* Logo/Name Section */}
            <div className="flex items-center space-x-2">
                <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                    <img src="/password.svg" alt="Lethe Logo" className="w-8 h-8" />
                    <span className="text-white text-lg font-semibold">Lethe</span>
                </Link>
            </div>

            {/* Navigation Links - Center */}
            <div className="flex items-center space-x-8">
                <Link href="/Dashboard/vault" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
                    Vault
                </Link>
                <Link href="/Dashboard/Fund" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
                    Fund
                </Link>
                <Link href="/Dashboard/Bridge" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
                    Bridge
                </Link>
                <Link href="/Dashboard/send" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
                    Transfer
                </Link>
                <Link href="/Dashboard/swap" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
                    Swap
                </Link>
                <div className="relative">
                    <button 
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex items-center justify-center text-white/80 hover:text-white transition-colors p-1"
                    >
                        <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {isDropdownOpen && (
                        <div className="absolute top-full mt-2 right-0 bg-[#0a0a0e]/95 backdrop-blur-sm border border-white/10 rounded-lg shadow-lg min-w-[200px] py-2">
                            <Link 
                                href="/Dashboard/stealth" 
                                className="block px-4 py-2 text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                                onClick={() => setIsDropdownOpen(false)}
                            >
                                Stealth
                            </Link>
                            <div className="px-4 py-2 text-white/50 text-sm cursor-not-allowed">
                                Docs <span className="text-xs bg-white/10 px-1 rounded">Soon</span>
                            </div>
                            <div className="px-4 py-2 text-white/50 text-sm cursor-not-allowed">
                                API <span className="text-xs bg-white/10 px-1 rounded">Soon</span>
                            </div>
                            <Link 
                                href="/todo" 
                                className="block px-4 py-2 text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                                onClick={() => setIsDropdownOpen(false)}
                            >
                                Roadmap
                            </Link>
                            
                        </div>
                    )}
                </div>
            </div>

            {/* Wallet Connect Button - Right */}
            <div className="relative">
                <WalletConnectButton />
            </div>
        </div>
    )
}

export default NavBar
