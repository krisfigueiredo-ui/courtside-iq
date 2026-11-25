import type { Config } from "tailwindcss";

/**
 * COURTSIDE IQ design tokens. Every colour is a CSS variable (RGB channels) defined in
 * app/globals.css for the dark and light themes, so utilities such as `bg-surface/60` work and
 * switching theme needs no re-render.
 *
 * Semantic names are the API. The legacy names below them (ink, mist, line, volt, ...) map onto
 * the same tokens so older markup follows the theme too.
 */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "./stories/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        raised: v("raised"),
        overlay: v("overlay"),
        hair: v("hair"),
        edge: v("edge"),
        fg: v("fg"),
        "fg-2": v("fg2"),
        muted: v("muted"),
        subtle: v("subtle"),
        accent: { DEFAULT: v("accent"), fg: v("accent-fg"), soft: v("accent-soft") },
        pos: v("pos"),
        neg: v("neg"),
        warn: v("warn"),
        info: v("info"),
        live: v("live"),
        // legacy aliases
        ink: { 950: v("canvas"), 900: v("canvas"), 850: v("surface"), 800: v("raised"), 700: v("overlay"), 600: v("edge"), 500: v("edge") },
        line: v("hair"),
        volt: { DEFAULT: v("accent"), 400: v("accent"), 300: v("accent"), 600: v("accent") },
        cyan: { DEFAULT: v("info"), 400: v("info") },
        mist: { DEFAULT: v("fg"), 300: v("fg2"), 400: v("muted"), 500: v("subtle") },
        gain: v("pos"),
        loss: v("neg"),
        flare: v("warn"),
        gold: v("warn"),
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        display: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["10.5px", { lineHeight: "14px" }],
        xs: ["11.5px", { lineHeight: "16px" }],
        sm: ["12.5px", { lineHeight: "18px" }],
        base: ["13.5px", { lineHeight: "20px" }],
      },
      borderRadius: { DEFAULT: "3px", sm: "2px", md: "3px", lg: "4px", xl: "4px", "2xl": "6px" },
      boxShadow: {
        panel: "none",
        glow: "none",
        pop: "0 12px 32px -12px rgb(0 0 0 / 0.45), 0 0 0 1px rgb(var(--c-edge))",
      },
      keyframes: {
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        shimmer: { "0%": { opacity: "0.55" }, "50%": { opacity: "0.9" }, "100%": { opacity: "0.55" } },
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
      },
      animation: {
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
        shimmer: "shimmer 1.4s ease-in-out infinite",
        marquee: "marquee 90s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
