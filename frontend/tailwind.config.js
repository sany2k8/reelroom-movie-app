/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Carried over from the original SunFlix palette — amber on near-black.
        ink: {
          DEFAULT: "#07090F",
          800: "#0B0E14",
          700: "#131826",
          600: "#1B2233",
          500: "#262E42",
        },
        amber: {
          DEFAULT: "#E8A33D",
          bright: "#FFC163",
          dim: "#6B5326",
        },
        chalk: "#F2F1EA",
        muted: "#8A93A6",
      },
      fontFamily: {
        display: ["'Bebas Neue'", "Impact", "sans-serif"],
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 40px -18px rgba(0,0,0,0.9)",
        glow: "0 0 0 1px rgba(232,163,61,0.35), 0 12px 40px -12px rgba(232,163,61,0.45)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "ken-burns": {
          from: { transform: "scale(1.04)" },
          to: { transform: "scale(1.14)" },
        },
      },
      animation: {
        "fade-up": "fade-up 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 300ms ease both",
        shimmer: "shimmer 1.6s infinite",
        "ken-burns": "ken-burns 18s ease-out both",
      },
    },
  },
  plugins: [],
};
