'use client';

import WalletConnectButton from "@/components/walletConnectButton";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Menu, X, Coins, ArrowLeftRight } from "lucide-react";

const NavBar: React.FC = () => {
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
            title: "Fund",
            description: "Anonymous Wallet Funding",
            icon: Coins,
            link: "/Dashboard/Fund",
            comingSoon: false
        },
        {
            title: "Swap",
            description: "Private Token Swapping",
            icon: ArrowLeftRight,
            link: "/Dashboard/swap",
            comingSoon: false
        }
    ];

    if (isMobile) {
        return (
            <>
                {/* Minimal mobile navbar - logo + hamburger */}
                <div className="fixed top-0 w-full h-12 z-[1000] bg-background/80 backdrop-blur-sm px-4 flex justify-between items-center">
                    {/* Logo Section */}
                    <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
                        <img src="/password.svg" alt="FundSwap Logo" className="w-6 h-6" />
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
                    <img src="/password.svg" alt="FundSwap Logo" className="w-8 h-8" />
                    <span className="text-white text-lg font-semibold">FundSwap</span>
                </Link>
            </div>

            {/* Navigation Links - Center */}
            <div className="flex items-center space-x-8">
                <Link href="/Dashboard/Fund" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
                    Fund
                </Link>
                <Link href="/Dashboard/swap" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
                    Swap
                </Link>
            </div>

            {/* Wallet Connect Button - Right */}
            <div className="relative">
                <WalletConnectButton />
            </div>
        </div>
    )
}

export default NavBar
