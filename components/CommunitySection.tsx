'use client';
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Github, Twitter } from "lucide-react";

const socialIcons = [
  {
    title: "Twitter",
    icon: Twitter,
    link: "https://x.com/LetheSol"
  }
];

export function CommunitySection() {
  return (
    <div className="px-6 py-16 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-4">Follow Along!</h2>
      </div>
      
      <div className="center grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {socialIcons.map((social) => (
          <a 
            key={social.title}
            href={social.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Card 
              className="bg-surface-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-card cursor-pointer group relative overflow-hidden h-full"
            >
              <CardContent className="p-6 flex flex-col items-center text-center space-y-4 relative z-10 h-full">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-300">
                  <social.icon className="h-7 w-7 text-primary" />
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <h3 className="font-semibold text-foreground text-lg">{social.title}</h3>
                </div>
              </CardContent>
              <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
