'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { PropsWithChildren } from 'react';

type WizardStepProps = PropsWithChildren<{
  stepKey: string | number;
  direction: 1 | -1;
}>;

const variants = {
  enter: (direction: 1 | -1) => ({ x: direction * 50, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: 1 | -1) => ({ x: direction * -50, opacity: 0 }),
};

export function WizardStep({ children, stepKey, direction }: WizardStepProps) {
  return (
    <AnimatePresence initial={false} custom={direction} mode="wait">
      <motion.div
        key={stepKey}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export default WizardStep;
