import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET(request: Request) {
  return handleJupiterRequest(request);
}

export async function POST(request: Request) {
  return handleJupiterRequest(request);
}

async function handleJupiterRequest(request: Request) {
  const url = new URL(request.url);
  const jupiterEndpoint = url.searchParams.get('endpoint');
  const domain = url.searchParams.get('domain') || 'lite-api.jup.ag';
  const params = Object.fromEntries(url.searchParams.entries());
  
  delete params.endpoint;
  delete params.domain;
  
  if (!jupiterEndpoint) {
    return NextResponse.json({ error: 'Missing Jupiter endpoint' }, { status: 400 });
  }
  
  const jupiterApiBase = `https://${domain}`;
  
  const hasQueryParams = jupiterEndpoint.includes('?');
  const queryString = new URLSearchParams(params).toString();
  
  const fullUrl = hasQueryParams 
    ? `${jupiterApiBase}${jupiterEndpoint}${queryString ? `&${queryString}` : ''}` 
    : `${jupiterApiBase}${jupiterEndpoint}${queryString ? `?${queryString}` : ''}`;
  
  try {
    console.log('Jupiter API proxy - Full URL:', fullUrl);
    console.log('Jupiter API proxy - Has API key:', !!process.env.JUPITER_API_KEY);
    
    const options: RequestInit = {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.JUPITER_API_KEY && { 'x-api-key': process.env.JUPITER_API_KEY })
      },
    };
    
    if (request.method === 'POST') {
      const body = await request.json();
      console.log('Jupiter API proxy - Request body received:', JSON.stringify(body, null, 2));
      console.log('Jupiter API proxy - QuoteResponse structure:', {
        inputMint: body.quoteResponse?.inputMint,
        outputMint: body.quoteResponse?.outputMint,
        inAmount: body.quoteResponse?.inAmount,
        outAmount: body.quoteResponse?.outAmount,
        userPublicKey: body.userPublicKey
      });
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(fullUrl, options);
    console.log('Jupiter API response status:', response.status);
    console.log('Jupiter API response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Jupiter API error response:', errorText);
      console.log('Jupiter API error - Request was:', {
        url: fullUrl,
        method: request.method,
        headers: options.headers,
        body: options.body
      });
      throw new Error(`Jupiter API returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error('Jupiter API proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch from Jupiter API' }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
}

export async function OPTIONS(request: Request) {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
