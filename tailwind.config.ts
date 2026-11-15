import type { Config } from "tailwindcss";

// Tailwind v4 is configured CSS-first: the design tokens live in app/globals.css
// (@theme). This file only pins the content globs and is loaded there via @config.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
};

export default config;
