"use client";

import { ReactNode } from "react";
import { motion, HTMLMotionProps } from "framer-motion";

interface GlassPanelProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  glow?: boolean;
  className?: string;
}

export function GlassPanel({ children, glow, className = "", ...props }: GlassPanelProps) {
  return (
    <motion.div
      className={`glass-panel p-4 ${glow ? "glow-cyan" : ""} ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
