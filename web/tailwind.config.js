/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        "panel-2": "rgb(var(--color-panel-2) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        "border-strong": "rgb(var(--color-border-strong) / <alpha-value>)",
        text: "rgb(var(--color-text) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        dim: "rgb(var(--color-dim) / <alpha-value>)",
        ember: {
          DEFAULT: "rgb(var(--color-ember) / <alpha-value>)",
          bright: "rgb(var(--color-ember-bright) / <alpha-value>)",
          deep: "rgb(var(--color-ember-deep) / <alpha-value>)",
          soft: "rgb(var(--color-ember) / 0.1)",
        },
        gain: "rgb(var(--color-gain) / <alpha-value>)",
        loss: "rgb(var(--color-loss) / <alpha-value>)",
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
