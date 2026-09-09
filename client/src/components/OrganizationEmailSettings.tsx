import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  CircleAlert,
  Globe,
  Link2,
  LoaderCircle,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  Unplug,
  X,
} from "lucide-react";
import { api } from "../api";
import type { OrganizationEmailSettings as EmailSettings } from "../types";
import { takeEmailConnectionReturn } from "../utils/emailConnectionReturn";
import "./organizationEmail.css";

type Action = "gmail" | "domain" | "verify" | "test" | "disconnect";
const statusLabels: Record<EmailSettings["status"], string> = {
  notConnected: "Not connected",
  pending: "Verification needed",
  connected: "Connected",
  reconnectRequired: "Reconnect required",
  disconnected: "Disconnected",
};
const headings: Record<Action, string> = {
  gmail: "Connect Gmail",
  domain: "Connect your domain",
  verify: "Verify domain & sender",
  test: "Send a test email?",
  disconnect: "Disconnect this sender?",
};
// React StrictMode can mount effects twice; an authorization code must be exchanged once.
let returnCompletion: Promise<EmailSettings> | null = null;
function consumeReturn() {
  const result = takeEmailConnectionReturn();
  if (result) {
    returnCompletion =
      result.error || !result.code || !result.state
        ? Promise.reject(
            new Error(
              "Gmail connection was cancelled or incomplete. You can start again.",
            ),
          )
        : api.completeGmailConnection(result.code, result.state);
  }
  return returnCompletion;
}

export function OrganizationEmailSettings({
  businessName,
}: {
  businessName: string;
}) {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const actionInFlight = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    const completion = consumeReturn();
    void (completion || api.getOrganizationEmail())
      .then((result) => {
        if (active) {
          setSettings(result);
          if (completion)
            setNotice(
              "Gmail is connected. Customer emails will use this sender.",
            );
        }
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Email settings could not be loaded.",
          );
        if (completion)
          void api
            .getOrganizationEmail()
            .then((result) => {
              if (active) setSettings(result);
            })
            .catch(() => undefined);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          returnCompletion = null;
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!action) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [action]);

  const close = () => {
    if (actionInFlight.current) return;
    form.current?.reset();
    dialog.current?.close();
    setAction(null);
    setDialogError("");
  };
  const open = (next: Action) => {
    setDialogError("");
    setAction(next);
  };
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      setSettings(await api.getOrganizationEmail());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not load email settings.",
      );
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!action || actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setDialogError("");
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password") || "");
    // Password/API key inputs are uncontrolled and are cleared on every submission.
    const passwordInput = form.current?.elements.namedItem(
      "password",
    ) as HTMLInputElement | null;
    if (passwordInput) passwordInput.value = "";
    try {
      if (action === "gmail") {
        const result = await api.startGmailConnection(
          String(values.get("senderName") || ""),
          password,
        );
        const target = new URL(result.authorizationUrl);
        if (
          target.origin !== "https://accounts.google.com" ||
          target.pathname !== "/o/oauth2/v2/auth"
        )
          throw new Error("The authorization URL was not recognized.");
        window.location.assign(target.href);
        return;
      }
      if (action === "domain") {
        const apiKeyInput = form.current?.elements.namedItem(
          "apiKey",
        ) as HTMLInputElement | null;
        if (apiKeyInput) apiKeyInput.value = "";
        const result = await api.connectEmailDomain({
          senderName: String(values.get("senderName") || ""),
          senderEmail: String(values.get("senderEmail") || ""),
          apiKey: String(values.get("apiKey") || ""),
          password,
        });
        setSettings(result);
        setNotice(
          result.status === "connected"
            ? "Your domain sender is connected."
            : "Domain saved. Complete DNS and sender verification before sending.",
        );
      } else if (action === "verify") {
        const result = await api.verifyEmailDomain(password);
        setSettings(result);
        setNotice(
          result.status === "connected"
            ? "Domain and sender verified. Your company can send email."
            : "Verification is still pending. Check the DNS records and the sender verification in your Brevo account.",
        );
      } else {
        const result =
          action === "test"
            ? await api.testOrganizationEmail(password)
            : await api.disconnectOrganizationEmail(password);
        setNotice(result.message);
        setSettings(await api.getOrganizationEmail());
      }
      actionInFlight.current = false;
      close();
      setError("");
    } catch (failure) {
      setDialogError(
        failure instanceof Error
          ? failure.message
          : "The email settings could not be updated.",
      );
    } finally {
      values.delete("password");
      values.delete("apiKey");
      actionInFlight.current = false;
      setBusy(false);
    }
  };

  const connected = settings?.status === "connected";
  const canConnect = !settings?.provider || settings.status === "disconnected";
  return (
    <section
      id="company-email"
      className="organization-email-section"
      aria-labelledby="organization-email-title"
      aria-busy={loading}
    >
      <header className="organization-email-heading">
        <div className="organization-email-title">
          <Mail size={20} />
          <h3 id="organization-email-title">Company Email</h3>
        </div>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={loading}
          title="Refresh email settings"
          aria-label="Refresh email settings"
          onClick={() => void refresh()}
        >
          <RefreshCw size={17} className={loading ? "email-spin" : ""} />
        </button>
      </header>
      {error || notice ? (
        <div
          className={`organization-email-notice${error ? " is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error ? <CircleAlert size={18} /> : <Check size={18} />}
          <span>{error || notice}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="organization-email-loading" role="status">
          <LoaderCircle className="email-spin" size={24} /> Loading email
          connection
        </div>
      ) : settings ? (
        <>
          <div className="organization-email-identity">
            <div className="organization-email-mark">
              {settings.provider === "brevo" ? (
                <Globe size={24} />
              ) : (
                <Mail size={24} />
              )}
            </div>
            <div className="organization-email-account">
              <strong>
                {settings.senderName || businessName || "Company sender"}
              </strong>
              <span>{settings.senderEmail || "No sender selected"}</span>
            </div>
            <span
              className={`organization-email-state ${connected ? "is-connected" : ""}`}
            >
              <span />
              {statusLabels[settings.status]}
            </span>
          </div>
          <div className="organization-email-permissions">
            <ShieldCheck size={16} />
            <span>
              {settings.provider === "gmail"
                ? "Gmail: send only + verified email identity"
                : "Verified sender required"}
            </span>
            <span>No inbox access</span>
          </div>
          {canConnect ? (
            <div className="organization-email-options">
              <button
                type="button"
                disabled={!settings.gmailAvailable}
                onClick={() => open("gmail")}
              >
                <Mail size={23} />
                <span>
                  <strong>Connect Gmail</strong>
                  <small>
                    {settings.gmailAvailable
                      ? "Google account"
                      : "Awaiting platform setup"}
                  </small>
                </span>
                <Link2 size={17} />
              </button>
              <button type="button" onClick={() => open("domain")}>
                <Globe size={23} />
                <span>
                  <strong>Use your domain</strong>
                  <small>Brevo delivery account</small>
                </span>
                <Link2 size={17} />
              </button>
            </div>
          ) : (
            <div className="organization-email-actions">
              {settings.provider === "brevo" ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => open("verify")}
                >
                  <ShieldCheck size={16} /> Verify domain & sender
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-outline"
                disabled={!connected}
                onClick={() => open("test")}
              >
                <Send size={16} /> Send test email
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => open("disconnect")}
              >
                <Unplug size={16} /> Disconnect
              </button>
            </div>
          )}
          {settings.provider === "brevo" &&
          settings.status === "pending" &&
          settings.dnsRecords.length ? (
            <div className="organization-email-dns">
              <h4>DNS Records</h4>
              <div className="organization-email-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Host</th>
                      <th>Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.dnsRecords.map((dns, index) => (
                      <tr key={`${dns.host}-${index}`}>
                        <td>{dns.type}</td>
                        <td>
                          <code>{dns.host}</code>
                        </td>
                        <td>
                          <code>{dns.value}</code>
                        </td>
                        <td>{dns.verified ? "Verified" : "Pending"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {settings.lastAcceptedAt ? (
            <p className="organization-email-last">
              Last accepted by provider:{" "}
              {new Date(settings.lastAcceptedAt).toLocaleString()}
            </p>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => void refresh()}
        >
          Retry
        </button>
      )}
      {action ? (
        <dialog
          ref={dialog}
          className="organization-email-dialog"
          aria-labelledby="email-dialog-title"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <form ref={form} onSubmit={(event) => void submit(event)}>
            <header>
              <div>
                <span>COMPANY EMAIL</span>
                <h3 id="email-dialog-title">{headings[action]}</h3>
              </div>
              <button
                type="button"
                aria-label="Close email dialog"
                disabled={busy}
                onClick={close}
              >
                <X size={20} />
              </button>
            </header>
            <div className="organization-email-dialog-body">
              {dialogError ? (
                <div
                  className="organization-email-notice is-error"
                  role="alert"
                >
                  <CircleAlert size={18} />
                  <span>{dialogError}</span>
                  <button
                    type="button"
                    aria-label="Dismiss error"
                    onClick={() => setDialogError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : null}
              {action === "gmail" ? (
                <p className="email-consent">
                  Google will request permission to send email and verify your
                  sender address. No permission to read, search, or delete mail
                  is requested.
                </p>
              ) : null}
              {action === "domain" ? (
                <p className="email-consent">
                  Use a domain you own, hosted with any registrar. Connect its
                  dedicated Brevo API key. DNS authentication and a verified
                  sender are required.
                </p>
              ) : null}
              {action === "verify" ? (
                <p className="email-consent">
                  Check the DNS records and register {settings?.senderEmail} as
                  a sender. Brevo may send a verification email to that address.
                </p>
              ) : null}
              {action === "test" ? (
                <p className="email-consent">
                  One test message will be sent to{" "}
                  <strong>{settings?.senderEmail}</strong>. No customer will
                  receive this test.
                </p>
              ) : null}
              {action === "disconnect" ? (
                <p className="email-consent">
                  Customer emails will stop until a sender is connected again.
                  An email already submitted to the provider cannot be recalled.
                  Password-recovery emails are unaffected.
                </p>
              ) : null}
              {action === "gmail" || action === "domain" ? (
                <label className="field">
                  <span>Sender name *</span>
                  <input
                    className="input"
                    name="senderName"
                    required
                    maxLength={120}
                    defaultValue={businessName}
                    autoComplete="organization"
                  />
                </label>
              ) : null}
              {action === "domain" ? (
                <>
                  <label className="field">
                    <span>Sender email *</span>
                    <input
                      className="input"
                      name="senderEmail"
                      type="email"
                      required
                      maxLength={254}
                      placeholder="bookings@yourcompany.com"
                      autoComplete="off"
                    />
                  </label>
                  <label className="field">
                    <span>Brevo API key *</span>
                    <input
                      className="input"
                      name="apiKey"
                      type="password"
                      required
                      minLength={20}
                      maxLength={512}
                      autoComplete="new-password"
                    />
                  </label>
                </>
              ) : null}
              <label className="field">
                <span>Your company account password *</span>
                <input
                  className="input"
                  name="password"
                  type="password"
                  required
                  maxLength={256}
                  autoComplete="current-password"
                />
              </label>
            </div>
            <footer>
              <button
                className="btn btn-outline"
                type="button"
                disabled={busy}
                onClick={close}
              >
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={16} className="email-spin" />
                ) : action === "disconnect" ? (
                  <Unplug size={16} />
                ) : (
                  <Check size={16} />
                )}
                {busy
                  ? "Please wait"
                  : action === "gmail"
                    ? "Continue to Google"
                    : action === "domain"
                      ? "Save connection"
                      : action === "verify"
                        ? "Verify"
                        : action === "test"
                          ? "Send test"
                          : "Disconnect"}
              </button>
            </footer>
          </form>
        </dialog>
      ) : null}
    </section>
  );
}
