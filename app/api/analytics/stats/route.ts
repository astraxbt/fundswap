import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET() {
  try {
    console.log('GET /api/analytics/stats called');
    
    const hasRedisCredentials = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
    
    if (!hasRedisCredentials) {
      console.log('Redis credentials not found, returning mock data for local development');
      
      const mockStats = [
        {
          operation: 'shield',
          count: 42,
          total_volume: 15.75
        },
        {
          operation: 'unshield',
          count: 28,
          total_volume: 8.32
        },
        {
          operation: 'transfer',
          count: 15,
          total_volume: 3.45
        },
        {
          operation: 'bridge_public',
          count: 8,
          total_volume: 12.50
        },
        {
          operation: 'bridge_private',
          count: 5,
          total_volume: 7.25
        },
        {
          operation: 'fund_anonymous',
          count: 12,
          total_volume: 18.90
        },
        {
          operation: 'fund_fasttrack',
          count: 6,
          total_volume: 9.60
        }
      ];
      
      const mockRecent = [
        { id: 1, operation: 'shield', amount_sol: 2.5, token_symbol: 'SOL' },
        { id: 2, operation: 'unshield', amount_sol: 1.2, token_symbol: 'SOL' },
        { id: 3, operation: 'shield', amount_sol: 5.0, token_symbol: 'SOL' }
      ];
      
      return NextResponse.json({
        success: true,
        stats: mockStats,
        recent_transactions: mockRecent,
        total_transactions: mockRecent.length,
        mock_data: true
      });
    }
    
    const stats = await redis.hgetall('analytics:stats') || {};
    
    const recentData = await redis.lrange('analytics:recent', 0, 9);
    const recent = recentData.map((data: any) => {
      if (typeof data === 'string') {
        return JSON.parse(data);
      }
      return data; // Already an object
    });
    
    const formattedStats = [];
    
    const operationTypes = ['shield', 'unshield', 'transfer', 'bridge_public', 'bridge_private', 'fund_anonymous', 'fund_fasttrack'];
    
    console.log('Available Redis stats keys:', Object.keys(stats));
    
    for (const operation of operationTypes) {
      const countKey = `${operation}_count`;
      const volumeKey = `${operation}_volume`;
      
      console.log(`Checking for ${operation}: count=${stats[countKey]}, volume=${stats[volumeKey]}`);
      
      if (stats[countKey]) {
        const operationStat = {
          operation,
          count: parseInt(stats[countKey] as string),
          total_volume: parseFloat((stats[volumeKey] as string) || '0')
        };
        console.log(`Adding to stats:`, operationStat);
        formattedStats.push(operationStat);
      }
    }
    
    console.log('Final formatted stats:', formattedStats);
    
    console.log('Stats retrieved:', { stats: formattedStats, recent });
    
    return NextResponse.json({ 
      success: true, 
      stats: formattedStats,
      recent_transactions: recent,
      total_transactions: recent.length
    });
  } catch (error: any) {
    console.error('Failed to get transaction stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get stats', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
