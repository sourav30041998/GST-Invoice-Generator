import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api } from "../api";

type PasswordRecoveryViewProps = {
  onBackToLogin: () => void;
};

type RecoveryStep = "email" | "otp" | "reset" | "success";

function maskEmail(email: string) {
  const [localPart = "", domain = ""] = email.split("@");
  const domainParts = domain.split(".");
  const domainName = domainParts.shift() || "";
  const suffix = domainParts.length ? `.${domainParts.join(".")}` : "";
  const mask = (value: string) =>
    value ? `${value.slice(0, 1)}${"*".repeat(Math.max(2, value.length - 1))}` : "***";
  return `${mask(localPart)}@${mask(domainName)}${suffix}`;
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PasswordRecoveryView({
  onBackToLogin,
}: PasswordRecoveryViewProps) {
  const [step, setStep] = useState<RecoveryStep>("email");
  const [email, setEmail] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [busyMessage, setBusyMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notificationSent, setNotificationSent] = useState(true);
  const otpInput = useRef<HTMLInputElement | null>(null);

  const passwordRequirements = useMemo(
    () => [
      { label: "12 to 128 characters", valid: newPassword.length >= 12 && newPassword.length <= 128 },
      { label: "One upper-case letter", valid: /[A-Z]/.test(newPassword) },
      { label: "One lower-case letter", valid: /[a-z]/.test(newPassword) },
      { label: "One number", valid: /\d/.test(newPassword) },
    ],
    [newPassword],
  );
  const passwordIsValid = passwordRequirements.every(
    (requirement) => requirement.valid,
  );
  const passwordsMatch =
    confirmPassword.length > 0 && newPassword === confirmPassword;

  useEffect(() => {
    if (resendSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(
      () => setResendSeconds((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const clearFeedback = () => {
    setError("");
    setNotice("");
  };

  const requestCode = async (isResend = false) => {
    clearFeedback();
    setBusyMessage(isResend ? "Sending a fresh code..." : "Checking securely...");
    try {
      const result = await api.requestPasswordRecovery(email.trim());
      setChallengeToken(result.challengeToken);
      setResetToken("");
      setOtp("");
      setResendSeconds(result.resendAfterSeconds);
      setNotice(
        "Only an active workspace owner receives a code. For account privacy, this page looks the same for every submitted address.",
      );
      setStep("otp");
      window.setTimeout(() => otpInput.current?.focus(), 0);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The recovery request could not be completed.",
      );
    } finally {
      setBusyMessage("");
    }
  };

  const handleEmailSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void requestCode();
  };

  const handleOtpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter all six digits from the email.");
      return;
    }

    clearFeedback();
    setBusyMessage("Verifying the code...");
    try {
      const result = await api.verifyPasswordRecoveryOtp(
        challengeToken,
        otp,
      );
      setResetToken(result.resetToken);
      setOtp("");
      setStep("reset");
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "The code could not be verified.",
      );
    } finally {
      setBusyMessage("");
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordIsValid) {
      setError("Create a password that meets every requirement.");
      return;
    }
    if (!passwordsMatch) {
      setError("New password and confirm password must match.");
      return;
    }

    clearFeedback();
    setBusyMessage("Securing the new password...");
    try {
      const result = await api.completePasswordRecovery(
        challengeToken,
        resetToken,
        newPassword,
        confirmPassword,
      );
      setNotificationSent(result.notificationSent);
      setChallengeToken("");
      setResetToken("");
      setNewPassword("");
      setConfirmPassword("");
      setStep("success");
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "The password could not be reset.",
      );
    } finally {
      setBusyMessage("");
    }
  };

  const restartRecovery = () => {
    clearFeedback();
    setStep("email");
    setChallengeToken("");
    setResetToken("");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setResendSeconds(0);
  };

  const stepNumber = step === "email" ? 1 : step === "otp" ? 2 : 3;

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <section className="auth-intro" aria-hidden="true">
          <div className="auth-brand-mark">
            <Building2 size={22} />
          </div>
          <p className="auth-kicker">Secure account recovery</p>
          <h1>Return to your workspace with confidence.</h1>
          <div className="auth-trust-row">
            <ShieldCheck size={17} />
            <span>Short-lived codes and single-use verification</span>
          </div>
        </section>

        <section
          className="auth-panel auth-panel-wide auth-panel-recovery"
          aria-busy={Boolean(busyMessage)}
        >
          {step !== "success" ? (
            <div className="auth-recovery-topbar">
              <button
                className="auth-icon-button"
                type="button"
                onClick={step === "email" ? onBackToLogin : restartRecovery}
                aria-label={step === "email" ? "Back to sign in" : "Start recovery again"}
                title={step === "email" ? "Back to sign in" : "Start recovery again"}
                disabled={Boolean(busyMessage)}
              >
                <ArrowLeft size={18} />
              </button>
              <div className="auth-stepper" aria-label={`Recovery step ${stepNumber} of 3`}>
                {[1, 2, 3].map((number) => (
                  <span
                    className={number <= stepNumber ? "active" : ""}
                    key={number}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {step === "email" ? (
            <form onSubmit={handleEmailSubmit}>
              <div className="auth-icon">
                <Mail size={22} />
              </div>
              <h2>Find your account</h2>
              <p>
                Enter the owner email approved for your organization workspace.
                This public screen never reveals whether an account exists.
              </p>
              <label className="field">
                <span>Registered email address</span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                  maxLength={254}
                  autoFocus
                  required
                />
              </label>
              {error ? <div className="auth-notice error" role="alert">{error}</div> : null}
              <button
                className="btn btn-primary btn-large"
                type="submit"
                disabled={Boolean(busyMessage)}
              >
                <span>Send verification code</span>
                <ArrowRight size={16} />
              </button>
            </form>
          ) : null}

          {step === "otp" ? (
            <form onSubmit={(event) => void handleOtpSubmit(event)}>
              <div className="auth-icon">
                <KeyRound size={22} />
              </div>
              <h2>Verify the email</h2>
              <p>
                If this address belongs to an active workspace, enter the
                six-digit code delivered to <strong>{maskEmail(email.trim())}</strong>.
              </p>
              <label className="field otp-code-field">
                <span>Six-digit verification code</span>
                <input
                  className="otp-code-input"
                  ref={otpInput}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => {
                    setOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setError("");
                  }}
                  aria-label="Six-digit verification code"
                  disabled={Boolean(busyMessage)}
                  required
                />
              </label>
              {notice ? <div className="auth-notice info" role="status">{notice}</div> : null}
              {error ? <div className="auth-notice error" role="alert">{error}</div> : null}
              <button
                className="btn btn-primary btn-large"
                type="submit"
                disabled={Boolean(busyMessage) || otp.length !== 6}
              >
                <span>Verify code</span>
                <ShieldCheck size={16} />
              </button>
              <div className="auth-recovery-actions">
                <button
                  className="auth-text-link"
                  type="button"
                  onClick={restartRecovery}
                  disabled={Boolean(busyMessage)}
                >
                  Use a different email
                </button>
                <button
                  className="auth-text-link"
                  type="button"
                  onClick={() => void requestCode(true)}
                  disabled={Boolean(busyMessage) || resendSeconds > 0}
                >
                  <RefreshCw size={14} />
                  {resendSeconds > 0
                    ? `Resend in ${formatCountdown(resendSeconds)}`
                    : "Resend code"}
                </button>
              </div>
            </form>
          ) : null}

          {step === "reset" ? (
            <form onSubmit={(event) => void handlePasswordSubmit(event)}>
              <div className="auth-icon">
                <ShieldCheck size={22} />
              </div>
              <h2>Create a new password</h2>
              <p>The verified recovery session can only update this password once.</p>
              <label className="field">
                <span>New password</span>
                <div className="password-input-wrap">
                  <input
                    className="input"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      setError("");
                    }}
                    minLength={12}
                    maxLength={128}
                    autoFocus
                    required
                  />
                  <button
                    className="password-visibility-button"
                    type="button"
                    onClick={() => setShowNewPassword((current) => !current)}
                    aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                    title={showNewPassword ? "Hide new password" : "Show new password"}
                  >
                    {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <div className="password-requirements" aria-label="Password requirements">
                {passwordRequirements.map((requirement) => (
                  <span className={requirement.valid ? "valid" : ""} key={requirement.label}>
                    <Check size={13} />
                    {requirement.label}
                  </span>
                ))}
              </div>
              <label className="field">
                <span>Confirm new password</span>
                <input
                  className={`input ${confirmPassword && !passwordsMatch ? "input-invalid" : ""}`}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setError("");
                  }}
                  maxLength={128}
                  aria-invalid={Boolean(confirmPassword && !passwordsMatch)}
                  required
                />
                {confirmPassword && !passwordsMatch ? (
                  <small className="field-error">Passwords do not match.</small>
                ) : null}
              </label>
              {error ? <div className="auth-notice error" role="alert">{error}</div> : null}
              <button
                className="btn btn-primary btn-large"
                type="submit"
                disabled={Boolean(busyMessage) || !passwordIsValid || !passwordsMatch}
              >
                <span>Reset password</span>
                <ShieldCheck size={16} />
              </button>
            </form>
          ) : null}

          {step === "success" ? (
            <div className="auth-recovery-success" role="status">
              <div className="auth-success-icon">
                <CheckCircle2 size={30} />
              </div>
              <p className="auth-kicker auth-success-kicker">Recovery complete</p>
              <h2>Password reset successfully</h2>
              <p>
                Your old sessions are closed. Sign in again with the new password.
              </p>
              {!notificationSent ? (
                <div className="auth-notice warning">
                  The password was changed, but the security notification email could not be delivered.
                </div>
              ) : (
                <div className="auth-notice info">
                  A confirmation email has been sent to the registered address.
                </div>
              )}
              <button
                className="btn btn-primary btn-large"
                type="button"
                onClick={onBackToLogin}
              >
                <span>Back to sign in</span>
                <ArrowRight size={16} />
              </button>
            </div>
          ) : null}

          {busyMessage ? (
            <div className="auth-busy-layer" role="status" aria-live="polite">
              <div className="recovery-loader" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <strong>{busyMessage}</strong>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
