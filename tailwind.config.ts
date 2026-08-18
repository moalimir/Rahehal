import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "var(--color-navy-950)", 900: "var(--color-navy-900)" },
        primary: { 600: "var(--color-primary-600)", 700: "var(--color-primary-700)" },
        cyan: { 500: "var(--color-cyan-500)" },
      },
      borderRadius: { card: "var(--radius-card)", panel: "var(--radius-panel)" },
      fontFamily: { sans: ["Tahoma", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
};

export default config;
