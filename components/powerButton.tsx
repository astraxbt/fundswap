'use client';
import { useState } from 'react';
import { Power } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion, Variants, Transition } from 'motion/react';
import { cn } from '@/lib/utils';
import { useId, useMemo } from 'react';

const PowerButton = ({ handleDisconnect }: { handleDisconnect: () => void }) => {
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const uniqueId = useId();
  
  const defaultVariants: Variants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };
  
  const defaultTransition: Transition = {
    type: 'spring',
    stiffness: 280,
    damping: 18,
    mass: 0.3,
  };

  const handleClick = () => {
    if (showDisconnect) {
      handleDisconnect();
      setShowDisconnect(false);
    } else {
      setShowDisconnect(true);
    }
  };

  const content = useMemo(() => {
    if (showDisconnect) {
      const text = 'Disconnect';
      const charCounts: Record<string, number> = {};
      return text.split('').map((char, index) => {
        const lowerChar = char.toLowerCase();
        charCounts[lowerChar] = (charCounts[lowerChar] || 0) + 1;
        return {
          id: `${uniqueId}-${lowerChar}${charCounts[lowerChar]}`,
          label: index === 0 ? char.toUpperCase() : lowerChar,
        };
      });
    }
    // Change the power icon to be treated more like a character
    return [{
      id: `${uniqueId}-icon`,
      label: '⚡' // Using a character that will morph into text
    }];
  }, [showDisconnect, uniqueId, isHovered]);

  return (
    <div className="flex items-center justify-center">
      <Button
        onClick={handleClick}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "h-10 rounded-full transition-colors duration-300 ease-in-out overflow-hidden",
          showDisconnect 
            ? "bg-red-500/10 hover:bg-red-500/15 text-red-500/50 px-4" 
            : "hover:bg-white/15 bg-white/5 transition-all duration-300 ease-in-out text-white/80 w-10"
        )}
      >
        <div className="flex items-center tracking-tight relative">
          <AnimatePresence mode="popLayout" initial={false}>
            {content.map((character) => (
              <motion.span
                key={character.id}
                layoutId={character.id}
                className="inline-block"
                aria-hidden="true"
                initial="initial"
                animate="animate"
                exit="exit"
                variants={defaultVariants}
                transition={defaultTransition}
              >
                {character.id === `${uniqueId}-icon` ? (
                  <Power className="h-5 w-5" strokeWidth={3} />
                ) : (
                  character.label
                )}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </Button>
    </div>
  );
};

export default PowerButton;