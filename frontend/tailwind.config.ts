import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sage: {
          DEFAULT: "#789879",
          50: "#F4F7F4",
          100: "#E6EDE7",
          200: "#CCDBCF",
          300: "#ADC4B1",
          400: "#8FAEA4",
          500: "#789879",
          600: "#5F7C60",
          700: "#49604A",
          800: "#364737",
          900: "#243025",
        },
        mint: {
          DEFAULT: "#E5F2E7",
          light: "#F0F8F1",
          dark: "#C3E2C7",
        },
        cream: {
          DEFAULT: "#FAF9F4",
          soft: "#F5F3EC",
          pure: "#FFFFFF",
        },
        charcoal: {
          DEFAULT: "#26352D",
          light: "#34453C",
          dark: "#1B2620",
          900: "#131C17",
        },
        accent: {
          yellow: "#FDE68A",
          yellowText: "#92400E",
          blue: "#BAE6FD",
          blueText: "#0369A1",
          coral: "#FECDD3",
          coralText: "#9F1239",
          emerald: "#A7F3D0",
          emeraldText: "#065F46",
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        '3xl': '1.75rem',
        '4xl': '2.25rem',
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(38, 53, 45, 0.05)',
        'soft-lg': '0 10px 30px -3px rgba(38, 53, 45, 0.08)',
        'glow': '0 0 25px rgba(120, 152, 121, 0.25)',
      }
    },
  },
  plugins: [],
};

export default config;
