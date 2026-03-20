import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--app-bg)",
        foreground: "var(--app-text)",
        card: "var(--app-surface-1)",
        "card-foreground": "var(--app-text)",
        popover: "var(--app-surface-1)",
        "popover-foreground": "var(--app-text)",
        border: "var(--app-border)",
        "border-soft": "var(--app-border-soft)",
        input: "var(--app-border)",
        ring: "var(--app-border-focus)",
        muted: "var(--app-surface-2)",
        "muted-foreground": "var(--app-text-muted)",
        accent: "var(--app-accent)",
        "accent-foreground": "var(--app-accent-fg)",
        "accent-hover": "var(--app-accent-hover)",
        primary: "var(--app-accent)",
        "primary-foreground": "var(--app-accent-fg)",
        destructive: "var(--app-destructive)",
        "destructive-foreground": "var(--app-destructive-fg)",
        // Surface variants
        "surface-1": "var(--app-surface-1)",
        "surface-2": "var(--app-surface-2)",
        "surface-3": "var(--app-surface-3)",
        "surface-glass": "var(--app-surface-glass)",
        "surface-elevated": "var(--app-surface-elevated)",
        // Status colors
        "status-error": "var(--app-status-error-text)",
        "status-error-bg": "var(--app-status-error-bg)",
        "status-error-border": "var(--app-status-error-border)",
        "status-success": "var(--app-status-success-text)",
        "status-success-bg": "var(--app-status-success-bg)",
        "status-success-border": "var(--app-status-success-border)",
        "status-warning": "var(--app-status-warning-text)",
        "status-warning-bg": "var(--app-status-warning-bg)",
        "status-warning-border": "var(--app-status-warning-border)",
        // Text variants
        "text-muted": "var(--app-text-muted)",
        "text-subtle": "var(--app-text-subtle)",
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        panel: "var(--app-shadow-lg)",
        sm: "var(--app-shadow-sm)",
        md: "var(--app-shadow-md)",
        lg: "var(--app-shadow-lg)",
        glow: "var(--app-shadow-glow)",
      },
      keyframes: {
        "fade-slide-in": {
          "0%": { opacity: "0", transform: "translateY(var(--app-motion-entrance-distance))" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-slide-in": "fade-slide-in var(--app-motion-entrance) var(--ease-out) both",
      },
      transitionDuration: {
        fast: "var(--app-motion-fast)",
        base: "var(--app-motion-base)",
        slow: "var(--app-motion-slow)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [typography],
};

export default config;
