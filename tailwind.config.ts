import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17212b",
        line: "#d9e0e8",
        surface: "#f4f6f8",
        brand: "#1f5f6f",
        accent: "#b7791f"
      },
      boxShadow: {
        soft: "0 8px 22px rgba(23, 33, 43, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
