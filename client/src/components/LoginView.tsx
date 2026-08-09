import { FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { api } from "../api";
import type { AuthStatus } from "../types";

type LoginViewProps = {
  onAuthenticated: (status: AuthStatus) => void;
  showToast: (message: string) => void;
};

export function LoginView({ onAuthenticated, showToast }: LoginViewProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const status = await api.login(username, password);
      onAuthenticated(status);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="auth-panel" onSubmit={(event) => void handleSubmit(event)}>
        <div className="auth-icon">
          <LockKeyhole size={22} />
        </div>
        <h1>Secure Access</h1>
        <p>Sign in to manage invoices, customer records, and business settings.</p>

        <label className="field">
          <span>Username</span>
          <input
            className="input"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
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

        <button className="btn btn-primary btn-large" type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
