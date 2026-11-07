import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: "#0B1020",
        darkCard: "#121A2F",
        darkBorder: "#1F2A44",
        accentPurple: "#7C5CFF",
        accentCyan: "#22D3EE",
      },
      borderRadius: {
        "2xl": "16px",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      backgroundImage: {
        "accent-gradient": "linear-gradient(135deg, #7C5CFF 0%, #22D3EE 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
