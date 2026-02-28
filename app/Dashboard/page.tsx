"use client";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ArrowLeftRight, 
  Coins
} from "lucide-react";
import Link from "next/link";
import NavBar from "@/components/navBar";

const FeatureCard = ({ 
  icon: Icon, 
  title, 
  description, 
  linkTo
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string; 
  linkTo: string;
}) => {
  return (
    <Link key={title} href={linkTo}>
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
        </CardContent>
        <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
      </Card>
    </Link>
  );
};

export default function DashboardPage() {
  const features = [
    {
      icon: Coins,
      title: "Fund",
      description: "Anonymous Wallet Funding",
      linkTo: "/Dashboard/Fund"
    },
    {
      icon: ArrowLeftRight,
      title: "Swap",
      description: "Private Token Swapping",
      linkTo: "/Dashboard/swap"
    }
  ];

  return (
    <div className="min-h-screen">
      <NavBar />
      <div className="px-6 py-16 max-w-7xl mx-auto pt-24">
        <div className="grid grid-cols-2 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {features.map((feature) => (
            <FeatureCard 
              key={feature.title} 
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              linkTo={feature.linkTo}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
