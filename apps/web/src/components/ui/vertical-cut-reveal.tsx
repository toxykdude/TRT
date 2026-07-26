'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

type VerticalCutRevealProps = {
  text: string;
  className?: string;
};

export function VerticalCutReveal({ text, className }: VerticalCutRevealProps) {
  const shouldReduceMotion = useReducedMotion();
  const words = text.split(' ');

  return (
    <span className={cn('inline-flex flex-wrap justify-center gap-x-[0.28em]', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="contents">
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className="overflow-hidden pb-[0.08em]">
            <motion.span
              className="block"
              initial={
                shouldReduceMotion ? false : { clipPath: 'inset(0 0 100% 0)', opacity: 0, y: '60%' }
              }
              animate={{ clipPath: 'inset(0 0 0% 0)', opacity: 1, y: 0 }}
              transition={{
                duration: 0.7,
                delay: index * 0.055,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {word}
            </motion.span>
          </span>
        ))}
      </span>
    </span>
  );
}
