'use client';

import { motion } from 'framer-motion';

export default function DeerflowBadge() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.2, duration: 0.8 }}
      className="flex items-center justify-center py-8"
    >
      <div className="flex items-center gap-3">
        <span className="h-px w-12 bg-ink/10" />
        <a
          href="https://deerflow.tech"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative text-xs tracking-widest text-ink/30 uppercase transition-colors duration-300 hover:text-coral"
        >
          <span className="relative">
            Created By Deerflow
            <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-coral transition-all duration-300 group-hover:w-full" />
          </span>
        </a>
        <span className="h-px w-12 bg-ink/10" />
      </div>
    </motion.div>
  );
}
