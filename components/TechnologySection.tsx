'use client';
import React from "react";

const technologies = [
  {
    title: "Probabalistic Forecast Model",
    description: "Advanced ridge regression modeling calibrated against live data",
    status: "Production",
    statusColor: "bg-green-600"
  },
  {
    title: "Continuous Model Training", 
    description: "Live reinforcement model training",
    status: "Production",
    statusColor: "bg-green-600"
  },
  {
    title: "Transparent Performance Tracking",
    description: "Verify our model",
    status: "Production",
    statusColor: "bg-green-600"
  },
  {
    title: "Live Bracket Committment to the Blockchain",
    description: "Submit tournament brackets verifiably on chain",
    status: "In Process", 
    statusColor: "bg-orange-600"
  }
];

export function TechnologySection() {
  return (
    <div className="px-6 py-16 max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-4">Built on Cutting-Edge sports modeling technology </h2>
        <p className="text-muted-foreground">We use ridge regression and continuous training to create accurate predictions</p>
      </div>
      
      <div className="space-y-4">
        {technologies.map((tech, index) => (
          <div 
            key={index}
            className="bg-surface-card border border-border rounded-lg p-6 hover:border-primary/50 transition-all duration-300 hover:shadow-card group"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-foreground mb-2">{tech.title}</h3>
                <p className="text-muted-foreground">{tech.description}</p>
              </div>
              <div className="ml-6">
                <span className={`${tech.statusColor} text-white text-sm px-3 py-1 rounded-full font-medium`}>
                  {tech.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
