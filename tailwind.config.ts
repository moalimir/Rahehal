import type { Config } from "tailwindcss";

/**
 * Tailwind is present for its preflight reset, not as this product's styling
 * system: the interface is written in seven hand-authored stylesheets and uses
 * effectively no utility classes. The theme below therefore exists to stop
 * preflight contradicting those stylesheets, not to describe a palette anyone
 * composes with.
 *
 * `fontFamily.sans` is the load-bearing entry. Preflight writes it into
 * `html { font-family: … }`, and it used to say `Tahoma, Arial` — with no
 * Estedad — so every element inheriting from `html` rather than `body`
 * rendered Persian text in a fallback face. `body` masked it, which is why it
 * survived. It now matches the stack the stylesheets actually set
 * (NFR-I18N-001: Persian typography is a product requirement, not a default).
 *
 * The colour and radius entries alias the canonical custom properties rather
 * than restating hex values, so they cannot drift from `design-system.css` and
 * `globals.css`. See `docs/PROJECT.md` §7 for which stylesheet owns which
 * token namespace.
 */
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "var(--color-navy-950)", 900: "var(--color-navy-900)" },
        primary: { 600: "var(--color-primary-600)", 700: "var(--color-primary-700)" },
        cyan: { 500: "var(--color-cyan-500)" },
        surface: "var(--color-surface)",
        border: "var(--color-border)",
      },
      borderRadius: { card: "var(--radius-card)", panel: "var(--radius-panel)" },
      fontFamily: { sans: ["Estedad", "Tahoma", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
};

export default config;
