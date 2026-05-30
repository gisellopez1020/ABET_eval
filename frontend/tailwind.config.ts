import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        uao: {
          dark: "#1F3864",
          mid: "#2E75B6",
          accent: "#C8102E",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
