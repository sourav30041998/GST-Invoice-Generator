import type { FormEvent } from "react";
import { useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "../api";
import type { AuthStatus } from "../types";

type InvitationAcceptanceViewProps = {
  token: string;
  onAccepted: (status: AuthStatus) => void;
  showToast: (message: string) => void;
};

export function InvitationAcceptanceView({
  token,
  onAccepted,
  showToast,
}: InvitationAcceptanceViewProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      showToast("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const status = await api.acceptInvitation(token, password);
      window.history.replaceState(null, "", "/");
      onAccepted(status);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Invitation could not be accepted.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <section className="auth-intro" aria-hidden="true">
          <div className="auth-brand-mark">
            <ShieldCheck size={22} />
          </div>
          <p className="auth-kicker">Approved Invitation</p>
          <h1>Set up your private company workspace.</h1>
          <div className="auth-trust-row">
            <LockKeyhole size={17} />
            <span>This invitation can be used once</span>
          </div>
        </section>

        <form
          className="auth-panel auth-panel-wide"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="auth-icon">
            <LockKeyhole size={22} />
          </div>
          <h2>Secure your account</h2>
          <p>Create a password to activate your approved company workspace.</p>

          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Confirm password</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>

          <button
            className="btn btn-primary btn-large"
            type="submit"
            disabled={submitting}
          >
            <span>{submitting ? "Activating..." : "Activate workspace"}</span>
            <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
