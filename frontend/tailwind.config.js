/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "on-tertiary": "#ffffff",
        "surface-container": "#e5eeff",
        "primary-fixed-dim": "#aac7ff",
        "surface-container-highest": "#d9e3f4",
        "primary-fixed": "#d7e3ff",
        "surface-dim": "#d1dbec",
        "on-secondary-fixed-variant": "#004883",
        "tertiary-container": "#006ab8",
        "tertiary": "#00528f",
        "primary-container": "#0066cc",
        "surface-tint": "#005cba",
        "outline-variant": "#c1c6d5",
        "outline": "#727784",
        "on-error-container": "#93000a",
        "inverse-on-surface": "#eaf1ff",
        "secondary": "#1960a6",
        "on-background": "#121c28",
        "error": "#ba1a1a",
        "surface-container-low": "#eef4ff",
        "on-error": "#ffffff",
        "on-tertiary-fixed": "#001c38",
        "on-primary": "#ffffff",
        "surface": "#f8f9ff",
        "secondary-fixed": "#d4e3ff",
        "inverse-primary": "#aac7ff",
        "surface-container-lowest": "#ffffff",
        "surface-bright": "#f8f9ff",
        "tertiary-fixed": "#d2e4ff",
        "background": "#f8f9ff",
        "surface-variant": "#d9e3f4",
        "on-surface-variant": "#414753",
        "primary": "#004e9f",
        "on-surface": "#121c28",
        "on-tertiary-fixed-variant": "#004880",
        "on-tertiary-container": "#dbe9ff",
        "inverse-surface": "#27313e",
        "on-secondary-fixed": "#001c39",
        "tertiary-fixed-dim": "#a1c9ff",
        "surface-container-high": "#dfe9fa",
        "on-secondary-container": "#00447e",
        "on-primary-fixed": "#001b3e",
        "error-container": "#ffdad6",
        "on-primary-container": "#dfe8ff",
        "on-secondary": "#ffffff",
        "on-primary-fixed-variant": "#00458e",
        "secondary-container": "#7ab3ff",
        "secondary-fixed-dim": "#a4c9ff"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        "full": "9999px"
      },
      fontFamily: {
        "headline": ["'Plus Jakarta Sans'", "sans-serif"],
        "body": ["'Inter'", "sans-serif"],
        "label": ["'Inter'", "sans-serif"]
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ],
}
