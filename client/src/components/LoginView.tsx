import type { FormEvent } from "react";
import { useState } from "react";
import { ArrowRight, Building2, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "../api";
import type { AuthStatus } from "../types";

type LoginViewProps = {
  onAuthenticated: (status: AuthStatus) => void;
  showToast: (message: string) => void;
};

export function LoginView({ onAuthenticated, showToast }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      onAuthenticated(await api.login(email, password));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <section className="auth-intro" aria-hidden="true">
          <div className="auth-brand-mark">
            <Building2 size={22} />
          </div>
          <p className="auth-kicker">GST Invoice Workspace</p>
          <h1>One secure home for your company invoices.</h1>
          <div className="auth-trust-row">
            <ShieldCheck size={17} />
            <span>Approved company access only</span>
          </div>
        </section>

        <form
          className="auth-panel auth-panel-wide"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="auth-icon">
            <LockKeyhole size={22} />
          </div>
          <h2>Welcome back</h2>
          <p>Sign in to your private invoice workspace.</p>

          <label className="field">
            <span>Email address</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button
            className="btn btn-primary btn-large"
            type="submit"
            disabled={submitting}
          >
            <span>{submitting ? "Please wait..." : "Sign in securely"}</span>
            <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
