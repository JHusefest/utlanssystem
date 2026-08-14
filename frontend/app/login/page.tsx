"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Alert } from "@/components/ui";

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Innlogging feilet.");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card card card-pad">
        <div className="stack-sm">
          <div>
            <h1>Logg inn</h1>
            <p className="sub muted small">
              Du trenger bare å logge inn for å registrere lån og returer.
            </p>
          </div>

          {error ? <Alert>{error}</Alert> : null}

          <form onSubmit={submit} className="stack-sm">
            <div className="field">
              <label htmlFor="username">Brukernavn</label>
              <input
                id="username"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Passord</label>
              <input
                id="password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Logger inn…" : "Logg inn"}
            </button>
          </form>

          <p className="small muted" style={{ marginTop: 4 }}>
            Har du ikke bruker? Kontakt en administrator.{" "}
            <Link href="/" className="link">
              Tilbake til oversikten
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
