"use client";
import { Card, CardContent } from "@/components/ui/card";
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
import Link from "next/link";
import NavBar from "@/components/navBar";

const FeatureCard = ({ 
  icon: Icon, 
  title, 
  description, 
  linkTo,
  disabled = false
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string; 
  linkTo: string;
  disabled?: boolean;
}) => {
  const cardContent = (
    <Card 
      className="bg-surface-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-card cursor-pointer group relative overflow-hidden h-full"
    >
      <CardContent className="p-6 flex flex-col items-center text-center space-y-4 relative z-10 h-full">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-300">
          <Icon className="h-7 w-7 text-primary" />
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <h3 className="font-semibold text-foreground mb-2 text-lg">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {disabled && (
          <span className="absolute top-3 right-3 text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">
            Soon
          </span>
        )}
      </CardContent>
      <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
    </Card>
  );

  return disabled ? (
    <div key={title}>
      {cardContent}
    </div>
  ) : (
    <Link key={title} href={linkTo}>
      {cardContent}
    </Link>
  );
};

export default function DashboardPage() {
  const features = [
    {
      icon: Vault,
      title: "Vault",
      description: "Secure Token Vault",
      linkTo: "/Dashboard/vault",
      disabled: false
    },
    {
      icon: Zap,
      title: "Bridge",
      description: "Instant Cross-Chain Bridge",
      linkTo: "/Dashboard/Bridge",
      disabled: false
    },
    {
      icon: Coins,
      title: "Fund",
      description: "Anonymous Wallet Funding",
      linkTo: "/Dashboard/Fund",
      disabled: false
    },
    {
      icon: Send,
      title: "Transfer",
      description: "Private Token Transfers",
      linkTo: "/Dashboard/send",
      disabled: false
    },
    {
      icon: ArrowLeftRight,
      title: "Swap",
      description: "Private Token Swapping",
      linkTo: "/Dashboard/swap",
      disabled: false
    },
    {
      icon: Shield,
      title: "Stealth",
      description: "Private Payment Gateway",
      linkTo: "/Dashboard/stealth",
      disabled: false
    },
    {
      icon: Map,
      title: "Roadmap",
      description: "Development timeline",
      linkTo: "/todo",
      disabled: false
    },
    {
      icon: Info,
      title: "Analytics",
      description: "Lethe Analytics",
      linkTo: "",
      disabled: true
    },
    {
      icon: FileText,
      title: "Docs",
      description: "Technical documentation",
      linkTo: "",
      disabled: true
    },
    {
      icon: Info,
      title: "API",
      description: "Lethe Apis",
      linkTo: "",
      disabled: true
    }
  ];

  return (
    <div className="min-h-screen">
      <NavBar />
      <div className="px-6 py-16 max-w-7xl mx-auto pt-24">
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {features.map((feature) => (
            <FeatureCard 
              key={feature.title} 
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              linkTo={feature.linkTo}
              disabled={feature.disabled}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
