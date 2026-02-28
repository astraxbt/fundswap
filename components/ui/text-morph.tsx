'use client';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion, Transition, Variants } from 'motion/react';
import { useMemo, useId, ReactNode } from 'react';
import { Power } from 'lucide-react';

export type TextMorphProps = {
  children: string | ReactNode;
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
  variants?: Variants;
  transition?: Transition;
};

export function TextMorph({
  children,
  as: Component = 'p',
  className,
  style,
  variants,
  transition,
}: TextMorphProps) {
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

  const content = useMemo(() => {
    if (typeof children === 'string') {
      const charCounts: Record<string, number> = {};
      return children.split('').map((char, index) => {
        const lowerChar = char.toLowerCase();
        charCounts[lowerChar] = (charCounts[lowerChar] || 0) + 1;

        return {
          id: `${uniqueId}-${lowerChar}${charCounts[lowerChar]}`,
          label:
            char === ' '
              ? '\u00A0'
              : index === 0
                ? char.toUpperCase()
                : lowerChar,
        };
      });
    }
    // Handle non-string content (like icons)
    return [{
      id: `${uniqueId}-icon`,
      label: children
    }];
  }, [children, uniqueId]);

  return (
    <Component className={cn(className)} aria-label={typeof children === 'string' ? children : 'icon'} style={style}>
      <AnimatePresence mode='popLayout' initial={false}>
        {content.map((item) => (
          <motion.span
            key={item.id}
            layoutId={item.id}
            className='inline-block'
            aria-hidden='true'
            initial='initial'
            animate='animate'
            exit='exit'
            variants={variants || defaultVariants}
            transition={transition || defaultTransition}
          >
            {item.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </Component>
  );
}