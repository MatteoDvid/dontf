/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        'nunito': ['var(--font-nunito-sans)', 'system-ui', 'sans-serif'],
        'airbnb': ['var(--font-nunito-sans)', 'system-ui', 'sans-serif'], // Alias pour Airbnb Cereal
      },
    },
  },
  plugins: [],
};
