/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        primary: "#00FFC8",
        "dark-bg": "#0D1117",
        secondary: "#8B949E",
        "voice-active": "#00FFC8",
        "voice-idle": "#8B949E",
        "voice-error": "#F85149",
      },
      fontFamily: {
        display: ['"JetBrains Mono"', "monospace"],
        body: ['"Noto Sans SC"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
