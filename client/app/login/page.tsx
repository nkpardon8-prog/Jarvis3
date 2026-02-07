"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/hooks/useAuth";
import { HudButton } from "@/components/ui/HudButton";
import { HudInput } from "@/components/ui/HudInput";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Shield } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, hasUsers, login, register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isRegisterMode = hasUsers === false;

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard/home");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      let result;
      if (isRegisterMode) {
        result = await register(username, password, displayName || undefined);
      } else {
        result = await login(username, password);
      }

      if (result.ok) {
        router.push("/dashboard/home");
      } else {
        setError(result.error || "Something went wrong");
      }
    } catch {
      setError("Connection error. Is the server running?");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-hud-bg circuit-bg">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-hud-bg circuit-bg">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="glass-panel p-8 glow-cyan">
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-hud-accent/10 border border-hud-accent/30">
              <Shield className="h-8 w-8 text-hud-accent" />
            </div>
            <h1 className="text-2xl font-bold tracking-wider text-hud-accent">
              J.A.R.V.I.S.
            </h1>
            <p className="mt-1 text-sm text-hud-text-secondary">
              {isRegisterMode
                ? "Create your admin account to get started"
                : "Welcome back. Sign in to continue."}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <HudInput
                label="Display Name"
                placeholder="How should Jarvis address you?"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            )}

            <HudInput
              label="Username"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />

            <HudInput
              label="Password"
              type="password"
              placeholder={isRegisterMode ? "Choose a password (6+ chars)" : "Enter your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegisterMode ? "new-password" : "current-password"}
              required
            />

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg bg-hud-error/10 border border-hud-error/30 px-3 py-2 text-sm text-hud-error"
              >
                {error}
              </motion.div>
            )}

            <HudButton
              type="submit"
              disabled={submitting || !username || !password}
              className="w-full"
              size="lg"
            >
              {submitting ? (
                <LoadingSpinner size="sm" />
              ) : isRegisterMode ? (
                "Create Account & Launch"
              ) : (
                "Sign In"
              )}
            </HudButton>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-hud-text-muted">
            {isRegisterMode
              ? "This will be the only admin account."
              : "Forgot your credentials? Reset the database to start fresh."}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
