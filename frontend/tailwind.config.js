/** @type {import('tailwindcss').Config} */

// Orbital's palette, taken from orbital.tech's own stylesheet.
//
// The neutrals are the important part: they are warm, not the cool grey Tailwind
// ships. Overriding `neutral` rather than introducing a new name re-tones every
// surface at once and keeps the class names already in use meaningful.
const neutral = {
  0: "#ffffff",
  50: "#f7f6f4",
  100: "#e6e4e1",
  200: "#d6d3ce",
  300: "#bfbbb4",
  400: "#9c978e",
  500: "#78746a",
  600: "#5c584f",
  700: "#423f38",
  800: "#2c2a25",
  900: "#1f1d1a",
  950: "#121110",
};

// The accent. Used sparingly — in this product a citation is the thing that earns a
// brand colour, because getting to the source is the whole point.
const brand = {
  50: "#fff4ea",
  100: "#ffe4cc",
  300: "#ffb876",
  500: "#ff7d1a",
  600: "#e66a00",
  700: "#b85400",
  900: "#803b1d",
};

// Deep teal, for the few places that want weight without shouting.
const sky = { 100: "#badfde", 300: "#668a8c", 500: "#13343b" };

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        neutral,
        brand,
        sky,
        // Orbital's own semantic pairs, used at the weight they use them.
        caution: { light: "#fcf8d8", dark: "#5e5515" },
        danger: { light: "#f8e4e4", dark: "#3b0b0b" },
        success: { light: "#cef5ca", dark: "#114e0b" },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        serif: ['"IBM Plex Serif"', "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
      boxShadow: {
        page: "0 1px 2px rgba(31, 29, 26, 0.06), 0 1px 8px rgba(31, 29, 26, 0.04)",
        lift: "0 2px 4px rgba(31, 29, 26, 0.06), 0 8px 24px rgba(31, 29, 26, 0.08)",
      },
    },
  },
  plugins: [],
};
