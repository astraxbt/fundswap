// app/components/PrivateSendWrapper.tsx
'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Dynamically import the PrivateSend component with SSR disabled
const PrivateSend = dynamic(
  () => import('./private'),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-64 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }
);

export default function PrivateSendWrapper() {
  return <PrivateSend />;
}