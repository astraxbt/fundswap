'use client';
import { useState } from 'react';
import { Power } from 'lucide-react';
import { TextMorph } from '@/components/ui/text-morph';
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from 'motion/react';

const DisconnectButton = ({ handleDisconnect }: { handleDisconnect: () => void }) => {
    const [showDisconnect, setShowDisconnect] = useState(false);
    
    const handleClick = () => {
      if (showDisconnect) {
        handleDisconnect();
      } else {
        setShowDisconnect(true);
      }
    };
  
    return (
      <div className="absolute right-3.5 top-3.5 flex items-center justify-center">
        <Button
          onClick={handleClick}
          className="h-9 w-fit rounded-full hover:bg-white/5 bg-transparent text-white/80 transition-all duration-300 ease-in-out"
        >
          <TextMorph>
            {showDisconnect ? "Disconnect" : <Power className="h-6 w-6" strokeWidth={3} />}
          </TextMorph>
        </Button>
      </div>
    );
  };
  
  export default DisconnectButton;