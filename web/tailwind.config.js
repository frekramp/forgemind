/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0b0e",
        panel: "#131318",
        "panel-2": "#1a1a21",
        border: "#26262e",
        "border-strong": "#34343f",
        text: "#e7e7ea",
        muted: "#9a9aa5",
        dim: "#6b6b75",
        ember: {
          DEFAULT: "#f4632a",
          bright: "#ff7a45",
          deep: "#c2410c",
          soft: "rgba(244,99,42,0.10)",
        },
        gain: "#34d399",
        loss: "#f43f5e",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        pulseEmber: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.45" } },
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-ember": "pulseEmber 2.4s ease-in-out infinite",
        "rise-in": "riseIn 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};
/* polished build */
