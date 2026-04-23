"use client";

import { motion } from "framer-motion";

/**
 * Ambient landing backdrop. An almost-invisible dark field with two
 * slow-breathing radial washes (ember + cyan) and a contour grid masked
 * into the center. Entirely decorative — sits behind all landing content.
 */
export function AmbientField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* base OLED */}
      <div className="absolute inset-0 bg-[var(--color-bg-oled)]" />

      {/* ember wash, upper-right */}
      <motion.div
        className="absolute -top-[25%] right-[-15%] h-[70vh] w-[70vh] rounded-full blur-[120px]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--color-ember) 22%, transparent) 0%, transparent 75%)",
        }}
        animate={{ opacity: [0.55, 0.8, 0.55], scale: [1, 1.04, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* cyan wash, lower-left */}
      <motion.div
        className="absolute bottom-[-25%] left-[-15%] h-[60vh] w-[60vh] rounded-full blur-[140px]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--color-cyan) 18%, transparent) 0%, transparent 75%)",
        }}
        animate={{ opacity: [0.4, 0.65, 0.4], scale: [1, 1.05, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />

      {/* faint contour grid, masked radially */}
      <div className="absolute inset-0 evacua-grid" />

      {/* top and bottom OLED fades for clean framing */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[var(--color-bg-oled)] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-60 bg-gradient-to-t from-[var(--color-bg-oled)] to-transparent" />
    </div>
  );
}
