/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        emeraldNight: "#041b12",
        emeraldRoyal: "#0f3d2b",
        goldAura: "#f1c56d",
        goldBright: "#fff2ba",
      },
      boxShadow: {
        crown: "0 24px 80px rgba(0, 0, 0, 0.45)",
      },
      backgroundImage: {
        "luxury-glow":
          "radial-gradient(circle at top, rgba(255, 221, 149, 0.2), transparent 36%), radial-gradient(circle at 20% 20%, rgba(42, 106, 82, 0.28), transparent 24%), linear-gradient(180deg, rgba(2, 10, 8, 0.88), rgba(4, 18, 12, 1))",
      },
      fontFamily: {
        display: ['\"Cinzel\"', '\"Times New Roman\"', "serif"],
        body: ['\"Manrope\"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
