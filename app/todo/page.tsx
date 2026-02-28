"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/Dashboard/card";
import { CheckCircle2, Clock, Circle, ArrowRight, User, Calendar } from "lucide-react";
import Link from "next/link";
import NavBar from "@/components/navBar";

export default function TodoPage() {
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  const statusSummary = [
    {
      icon: CheckCircle2,
      count: 3,
      label: "Completed",
      color: "text-green-400",
      bgColor: "bg-green-900/20",
      borderColor: "border-green-800/50",
      status: "Completed"
    },
    {
      icon: Clock,
      count: 3,
      label: "In Progress",
      color: "text-purple-400",
      bgColor: "bg-purple-900/20",
      borderColor: "border-purple-800/50",
      status: "In Progress"
    },
    {
      icon: Circle,
      count: 3,
      label: "Planned",
      color: "text-blue-400",
      bgColor: "bg-blue-900/20",
      borderColor: "border-blue-800/50",
      status: "Planned"
    }
  ];

  const todoItems = [
    {
      id: 1,
      title: "Add Multi-Token Shield/Unshield Support",
      description: "Implement multi-token shield/unshield support",
      status: "Completed",
      statusColor: "text-green-400",
      statusBg: "bg-green-900/20",
      category: "Feature Improvement",
      categoryColor: "text-purple-400",
      categoryBg: "bg-purple-800/60",
      icon: CheckCircle2
    },
    {
      id: 2,
      title: "Add To-Do",
      description: "Add to-do page so that users can view our work",
      status: "Completed",
      statusColor: "text-green-400",
      statusBg: "bg-green-900/20",
      category: "Frontend",
      categoryColor: "text-grey-400",
      categoryBg: "bg-grey-800/60",
      icon: CheckCircle2
    },
    {
      id: 3,
      title: "Resolve bug with multi-token shield",
      description: "Implement ATA account creation so that users have a seamless UX",
      status: "Completed",
      statusColor: "text-green-400",
      statusBg: "bg-green-900/20",
      category: "Bug Fix",
      categoryColor: "text-gray-400",
      categoryBg: "bg-gray-800/60",
      icon: CheckCircle2
    },
    {
      id: 4,
      title: "Multi-Token Private Sends",
      description: "Allow users to send all tokens privately",
      status: "In Progress",
      statusColor: "text-purple-400",
      statusBg: "bg-purple-900/20",
      category: "Feature Update",
      categoryColor: "text-purple-400",
      categoryBg: "bg-purple-800/60",
      icon: Clock
    },
    {
      id: 5,
      title: "LetheSwap v2",
      description: "Finish LetheSwap v2, which refactors the entire swap interface",
      status: "In Progress",
      statusColor: "text-purple-400",
      statusBg: "bg-purple-900/20",
      category: "Feature Update",
      categoryColor: "text-purple-400",
      categoryBg: "bg-purple-800/60",
      icon: Clock
    },
    {
      id: 6,
      title: "Analytics Dashboard",
      description: "Create a comprehensive privacy dashboard for users",
      status: "In Progress",
      statusColor: "text-purple-400",
      statusBg: "bg-purple-900/20",
      category: "New Feature",
      categoryColor: "text-blue-400",
      categoryBg: "bg-blue-800/60",
      icon: Clock
    },
    {
      id: 7,
      title: "Re-Do Guides",
      description: "Fix guides in a way that all users can understand",
      status: "Planned",
      statusColor: "text-blue-400",
      statusBg: "bg-blue-900/20",
      category: "Frontend",
      categoryColor: "text-grey-400",
      categoryBg: "bg-grey-800/60",
      icon: Circle
    },
    {
      id: 8,
      title: "Come Up With Comprehensive Tokenomics Plans",
      description: "Discuss with users the next best steps for token utility/10.3% supply unlock",
      status: "Planned",
      statusColor: "text-blue-400",
      statusBg: "bg-blue-900/20",
      category: "Comms",
      categoryColor: "text-red-400",
      categoryBg: "bg-red-800/60",
      icon: Circle
    },
    {
      id: 9,
      title: "Secret Feature",
      description: "More info to be revealed soon",
      status: "Planned",
      statusColor: "text-blue-400",
      statusBg: "bg-blue-900/20",
      category: "New Feature",
      categoryColor: "text-blue-400",
      categoryBg: "bg-blue-800/60",
      icon: Circle
    }
  ];

  const filteredItems = selectedFilter 
    ? todoItems.filter(item => item.status === selectedFilter)
    : todoItems;

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-[#16151E] text-white">
      <NavBar />
      <div className="pt-24 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-center mb-4">
          <Link href="/" className="text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors">
            <ArrowRight className="h-4 w-4 rotate-180" />
            <span>Back to Home</span>
          </Link>
        </div>
        
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">LetheMap</span>
          </h1>
          <p className="text-white/70 max-w-3xl mx-auto">
            Track our progress as we continue to build out $lethe. Here's what we're working on, what's coming next, and what we've already delivered!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {statusSummary.map((status, index) => {
            const IconComponent = status.icon;
            const isSelected = selectedFilter === status.status;
            return (
              <Card 
                key={index} 
                className={`${status.bgColor} backdrop-blur-sm border ${status.borderColor} ${isSelected ? 'ring-2 ring-purple-400' : ''} hover:scale-105 transition-all duration-300 cursor-pointer`}
                onClick={() => setSelectedFilter(selectedFilter === status.status ? null : status.status)}
              >
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <IconComponent className={`h-6 w-6 ${status.color}`} />
                  </div>
                  <div className={`text-2xl font-bold ${status.color} mb-1`}>
                    {status.count}
                  </div>
                  <div className="text-white/90 font-medium text-sm">
                    {status.label}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {selectedFilter && (
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-900/20 border border-purple-800/50 rounded-full">
              <span className="text-purple-400 font-medium">Filtering by: {selectedFilter}</span>
              <button 
                onClick={() => setSelectedFilter(null)}
                className="text-purple-400 hover:text-purple-300 ml-2"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <Card key={item.id} className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50 hover:border-purple-500/30 transition-all duration-300 hover:scale-105 transform">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${item.statusBg} ${item.statusColor}`}>
                      <IconComponent className="h-3 w-3 mr-1" />
                      {item.status}
                    </div>
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${item.categoryBg} ${item.categoryColor}`}>
                      {item.category}
                    </div>
                  </div>
                  <CardTitle className="text-white text-lg font-semibold">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-white/70 text-sm">
                    {item.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
