import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      inherit: "inherit",
      current: "currentColor",
      transparent: "transparent",
      white: "rgb(var(--color-white) / <alpha-value>)",
      soft: "rgb(var(--color-soft) / <alpha-value>)",
      canvas: "rgb(var(--color-canvas) / <alpha-value>)",
      ink: "rgb(var(--color-ink) / <alpha-value>)",
      strong: "rgb(var(--color-strong) / <alpha-value>)",
      line: "rgb(var(--color-ink) / 0.16)",
      brand: "rgb(var(--color-brand) / <alpha-value>)",
      accent: "rgb(var(--color-accent) / <alpha-value>)",
      info: "rgb(var(--color-info) / <alpha-value>)",
      success: "rgb(var(--color-success) / <alpha-value>)",
      warning: "rgb(var(--color-warning) / <alpha-value>)",
      danger: "rgb(var(--color-danger) / <alpha-value>)"
    },
    boxShadow: {
      none: "none",
      sm: "0 1px 2px rgb(var(--color-strong) / 0.05)",
      card: "0 8px 22px rgb(var(--color-strong) / 0.06)",
      md: "0 4px 10px rgb(var(--color-strong) / 0.1)",
      lg: "0 10px 24px rgb(var(--color-strong) / 0.12)",
      xl: "0 20px 32px rgb(var(--color-strong) / 0.14)",
      "2xl": "0 24px 48px rgb(var(--color-strong) / 0.18)"
    }
  },
  plugins: []
};

export default config;
