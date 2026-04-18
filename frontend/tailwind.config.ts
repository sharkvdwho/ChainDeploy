import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./store/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        stellar: {
          50: "#eef8ff",
          100: "#d9efff",
          200: "#bce3ff",
          300: "#8ed0ff",
          400: "#59b4ff",
          500: "#3396ff",
          600: "#1a76f5",
          700: "#145fe1",
          800: "#174db6",
          900: "#19448f",
          950: "#122a57",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        brand: ["var(--font-brand)", "var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
