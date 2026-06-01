import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        app: {
          bg:      "#e8ecf1",
          surface: "#ffffff",
          raised:  "#f1f5f9",
          border:  "#cbd5e1",
          muted:   "#94a3b8",
          text:    "#0f172a",
          dim:     "#334155",
          faint:   "#64748b",
          accent:  "#0284c7",
        },
      },
      fontFamily: {
        ui:   ["var(--font-geist)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "glow-sm":  "0 0 8px  rgba(2, 132, 199, 0.12)",
        "glow":     "0 0 16px rgba(2, 132, 199, 0.18)",
        "glow-lg":  "0 0 32px rgba(2, 132, 199, 0.22)",
        "inner-light": "inset 0 1px 0 rgba(255,255,255,0.8)",
        "card":     "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.08)",
      },
      animation: {
        "pulse-dot":   "pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in":     "fade-in 0.25s ease-out",
        "slide-left":  "slide-left 0.25s ease-out",
        "slide-right": "slide-right 0.25s ease-out",
        "running":     "running-pulse 1.5s ease-in-out infinite",
        "perf-warn":   "perf-warn 2s ease-in-out infinite",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.35" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-left": {
          from: { opacity: "0", transform: "translateX(8px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "slide-right": {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "running-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(2, 132, 199, 0)" },
          "50%":      { boxShadow: "0 0 0 4px rgba(2, 132, 199, 0.15)" },
        },
        "perf-warn": {
          "0%, 100%": { borderColor: "rgba(245, 158, 11, 0.45)" },
          "50%":      { borderColor: "rgba(245, 158, 11, 0.85)" },
        },
      },
    },
  },
  plugins: [],
}
export default config
