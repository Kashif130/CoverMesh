import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101714",
        surface: "#161F1A",
        surface2: "#1C271F",
        paper: "#EDE7D9",
        line: "#2A362E",
        signal: "#E3A33E",
        signalDim: "#8A652C",
        triggered: "#C1483A",
        ok: "#3E8074",
        muted: "#8B9690",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        body: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        grain: "radial-gradient(circle at 1px 1px, rgba(237,231,217,0.05) 1px, transparent 0)",
      },
    },
  },
  plugins: [],
};
export default config;
