"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const responseText = await response.text();
      let data: { error?: string } = {};

      try {
        data = responseText ? (JSON.parse(responseText) as { error?: string }) : {};
      } catch {
        data = { error: responseText || "Request failed." };
      }

      if (!response.ok) {
        throw new Error(data.error || "Request failed.");
      }

      router.push("/workspace");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-label={isRegister ? "Register" : "Login"}>
        <div className="auth-mark">
          <Sparkles size={22} />
        </div>
        <p className="eyebrow">Atoms Demo</p>
        <h1>{isRegister ? "Create your agent builder account" : "Welcome back to agent builder"}</h1>
        <p className="auth-copy">
          Sign in, describe an app, and watch the agent move through design, code, test, and deploy.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister ? (
            <label>
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Alex"
                autoComplete="name"
              />
            </label>
          ) : null}

          <label>
            <span>Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label>
            <span>Password</span>
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={isLoading}>
            <LockKeyhole size={18} />
            {isLoading ? "Working..." : isRegister ? "Register and enter" : "Login"}
            <ArrowRight size={18} />
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? "Already have an account?" : "Need an account?"}
          <Link href={isRegister ? "/login" : "/register"}>{isRegister ? "Login" : "Register"}</Link>
        </p>
      </section>
    </main>
  );
}
