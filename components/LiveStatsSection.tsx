'use client';
import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface AnalyticsStats {
  operation: string;
  count: number;
  total_volume: number;
}

interface AnalyticsResponse {
  success: boolean;
  stats: AnalyticsStats[];
  recent_transactions: any[];
  total_transactions: number;
}

export function LiveStatsSection() {
  const [stats, setStats] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/analytics/stats');
        const data = await response.json();
        
        if (data.success) {
          setStats(data);
        } else {
          setError('Failed to load analytics data');
        }
      } catch (err) {
        setError('Error fetching analytics data');
        console.error('Analytics fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    
    const interval = setInterval(fetchStats, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const getPrivacyVaultVolume = (): number => {
    if (!stats) return 0;
    const shieldVolume = stats.stats.find(s => s.operation === 'shield')?.total_volume || 0;
    const unshieldVolume = stats.stats.find(s => s.operation === 'unshield')?.total_volume || 0;
    return shieldVolume + unshieldVolume;
  };

  const getBridgeVolume = (): number => {
    if (!stats) return 0;
    const publicBridgeVolume = stats.stats.find(s => s.operation === 'bridge_public')?.total_volume || 0;
    const privateBridgeVolume = stats.stats.find(s => s.operation === 'bridge_private')?.total_volume || 0;
    return publicBridgeVolume + privateBridgeVolume;
  };

  const getTotalWalletsFunded = (): number => {
    if (!stats) return 0;
    const anonymousFunds = stats.stats.find(s => s.operation === 'fund_anonymous')?.count || 0;
    const fasttrackFunds = stats.stats.find(s => s.operation === 'fund_fasttrack')?.count || 0;
    return anonymousFunds + fasttrackFunds;
  };

  const getTotalVolume = (): number => {
    if (!stats) return 0;
    return getPrivacyVaultVolume() + getBridgeVolume() + 
           (stats.stats.find(s => s.operation === 'fund_anonymous')?.total_volume || 0) +
           (stats.stats.find(s => s.operation === 'fund_fasttrack')?.total_volume || 0);
  };

  const formatVolume = (volume: number): string => {
    if (volume === 0) return "0 SOL";
    if (volume < 1) return `${volume.toFixed(3)} SOL`;
    if (volume < 1000) return `${volume.toFixed(2)} SOL`;
    if (volume < 1000000) return `${(volume / 1000).toFixed(1)}K SOL`;
    return `${(volume / 1000000).toFixed(1)}M SOL`;
  };

  const liveStats = [
    {
      value: loading ? "Loading..." : formatVolume(getPrivacyVaultVolume()),
      label: "Brackets Created",
      description: "Total Brackets Created"
    },
    {
      value: loading ? "Loading..." : formatVolume(getBridgeVolume()),
      label: "Model Accuracy", 
      description: "Accuracy of Model Picks"
    },
    {
      value: loading ? "Loading..." : getTotalWalletsFunded().toString(),
      label: "Unique Participating Wallets",
      description: "Toal Unique Wallets"
    },
    {
      value: loading ? "Loading..." : formatVolume(getTotalVolume()),
      label: "Hashes Stored On-Chain",
      description: "Total Hashes Commited On=Chain"
    }
  ];

  if (error) {
    const fallbackStats = [
      {
        value: "Coming Soon",
        label: "Brackets Created",
        description: "Total Brackets Created"
      },
      {
        value: "Coming Soon",
        label: "Model Accuracy",
        description: "Accuracy of Model Picks"
      },
      {
        value: "Coming Soon",
        label: "Unique Participating Wallets",
        description: "Toal Unique Wallets"
      },
      {
        value: "Coming Soon",
        label: "Hashes Stored On-Chain",
        description: "Total Hashes Commited On=Chain"
      }
    ];

    return (
      <div className="px-6 py-16 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Live Analytics</h2>
          <p className="text-muted-foreground">Real-time metrics from Lethe</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {fallbackStats.map((stat, index) => (
            <Card 
              key={index}
              className="bg-surface-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-card"
            >
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold text-primary mb-2">{stat.value}</div>
                <div className="font-semibold text-foreground mb-1">{stat.label}</div>
                <div className="text-sm text-muted-foreground">{stat.description}</div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center mt-4">
          <p className="text-sm text-muted-foreground">Analytics temporarily unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-16 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-4">Live Privacy Analytics</h2>
        <p className="text-muted-foreground">Real-time metrics from the Lethe protocol</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {liveStats.map((stat, index) => (
          <Card 
            key={index}
            className="bg-surface-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-card"
          >
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-primary mb-2">{stat.value}</div>
              <div className="font-semibold text-foreground mb-1">{stat.label}</div>
              <div className="text-sm text-muted-foreground">{stat.description}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && stats && (
        <div className="text-center mt-4">
          <p className="text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleTimeString()} • Updates every 30 seconds
          </p>
        </div>
      )}
    </div>
  );
}
