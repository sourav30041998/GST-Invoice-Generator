import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { ArrowRight, Building2, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "../api";
import type { AuthStatus } from "../types";

type LoginViewProps = {
  onAuthenticated: (status: AuthStatus) => void;
  onForgotPassword: () => void;
  showToast: (message: string) => void;
};

export function LoginView({
  onAuthenticated,
  onForgotPassword,
  showToast,
}: LoginViewProps) {
  const [email, setEmail] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    const passwordInput = passwordRef.current;
    const password = passwordInput?.value || "";
    const loginRequest = api.login(email, password);
    if (passwordInput) {
      passwordInput.value = "";
    }
    try {
      onAuthenticated(await loginRequest);
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
          <h1>Your company workspace.</h1>
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

          <div className="field">
            <div className="auth-field-heading">
              <label htmlFor="login-password">Password</label>
              <button
                className="auth-text-link"
                type="button"
                onClick={onForgotPassword}
              >
                Forgot password?
              </button>
            </div>
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              ref={passwordRef}
              required
            />
          </div>

          <button
            className="btn btn-primary btn-large"
            type="submit"
            disabled={submitting}
          >
            <span>{submitting ? "Please wait..." : "Sign in"}</span>
            <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
