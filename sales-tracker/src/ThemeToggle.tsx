import React from "react";
import type { Theme } from "./useTheme";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
  darkHeader?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle, darkHeader = false }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    aria-pressed={theme === "dark"}
    className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
      darkHeader
        ? "border-gray-600 bg-gray-800 text-white hover:bg-gray-700"
        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
    }`}
  >
    {theme === "dark" ? (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </svg>
    ) : (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
      </svg>
    )}
    {theme === "dark" ? "Light mode" : "Dark mode"}
  </button>
);
