import type { Config } from "tailwindcss";

// QuikTea brand palette — mirrors the CSS variables in the original tool.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#1A5088",
        "navy-dk": "#143f6b",
        orange: "#E8593C",
        "orange-dk": "#c94628",
        cream: "#F8F6F2",
        "cream-dk": "#f0ede6",
        ink: "#3A3A3A",
        muted: "#7a7a7a",
        "brand-border": "#e2ddd6",
      },
      fontFamily: {
        serif: ["Georgia", "Times New Roman", "serif"],
        sans: ['"Helvetica Neue"', "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
