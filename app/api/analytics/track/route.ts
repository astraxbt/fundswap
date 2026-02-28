import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function POST(request: Request) {
  try {
    console.log('POST /api/analytics/track called');
    
    const { operation, amount_sol, token_symbol, user_wallet } = await request.json();
    
    console.log('Tracking transaction:', { operation, amount_sol, token_symbol, user_wallet });
    
    const nextId = await redis.incr('analytics:next_id');
    
    const transaction = {
      id: nextId,
      operation,
      amount_sol,
      token_symbol: token_symbol || 'SOL'
    };
    
    await redis.hset(`analytics:transaction:${nextId}`, transaction);
    
    await redis.lpush('analytics:recent', JSON.stringify(transaction));
    await redis.ltrim('analytics:recent', 0, 99);
    
    await redis.hincrby('analytics:stats', `${operation}_count`, 1);
    await redis.hincrbyfloat('analytics:stats', `${operation}_volume`, amount_sol);
    
    console.log(`Successfully tracked ${operation} transaction: ${amount_sol} SOL`);
    
    return NextResponse.json({ 
      success: true, 
      id: nextId 
    });
  } catch (error: any) {
    console.error('Failed to track transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to track transaction', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Analytics track endpoint is working',
    method: 'Use POST to track transactions'
  });
}
