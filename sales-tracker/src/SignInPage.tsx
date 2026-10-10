import React, { useState, type FormEvent } from "react";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "./useTheme";

interface SignInPageProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (name: string, email: string, password: string) => Promise<void>;
  theme: Theme;
  onToggleTheme: () => void;
}

export const SignInPage: React.FC<SignInPageProps> = ({ onSignIn, onSignUp, theme, onToggleTheme }) => {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (mode === "sign-in") {
        await onSignIn(email.trim(), password);
      } else {
        await onSignUp(name.trim(), email.trim(), password);
        setMessage("Account created. Sign in with your email and password.");
        setMode("sign-in");
        setPassword("");
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to authenticate.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#edf3ed] px-4 py-10 dark:bg-gray-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-950/10 bg-white shadow-xl shadow-emerald-950/10">
        <div className="bg-emerald-950 px-8 py-8 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Horeca Sales</p>
          <h1 className="mt-3 text-2xl font-bold">{mode === "sign-in" ? "Sign in" : "Create account"}</h1>
          <p className="mt-1 text-sm text-emerald-100">Sales Call Tracker</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-8">
          {mode === "sign-up" && (
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-gray-800">
                Name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-gray-800">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-gray-800">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={mode === "sign-up" ? 8 : undefined}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            />
          </div>

          {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-emerald-800 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60"
          >
            {isSubmitting ? "Please wait..." : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
          <p className="text-center text-sm text-gray-600">
            {mode === "sign-in" ? "New to Horeca Sales?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setError(null);
                setMessage(null);
              }}
              className="font-semibold text-emerald-800 hover:underline"
            >
              {mode === "sign-in" ? "Create account" : "Sign in"}
            </button>
          </p>
        </form>
      </section>
    </main>
  );
};