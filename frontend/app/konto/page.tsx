"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Alert, Badge, Loading, Toast } from "@/components/ui";
import { api } from "@/lib/api";

export default function AccountPage() {
  const { user, isAdmin, loading, logout } = useAuth();
  const router = useRouter();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== repeat) {
      setError("De to nye passordene er ikke like.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      setToast("Passordet er endret.");
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å endre passordet.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="card">
        <Loading rows={3} />
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Min konto</h1>
          <p className="sub">Innloggingsdetaljer og passord.</p>
        </div>
        <button className="btn" onClick={logout}>
          Logg ut
        </button>
      </div>

      <div className="stack">
        <div className="card card-pad">
          <div className="detail-grid">
            <div>
              <div className="k">Navn</div>
              <div className="v">{user.full_name}</div>
            </div>
            <div>
              <div className="k">Brukernavn</div>
              <div className="v mono">{user.username}</div>
            </div>
            <div>
              <div className="k">Klasse</div>
              <div className="v">{user.school_class || "–"}</div>
            </div>
            <div>
              <div className="k">Rolle</div>
              <div className="v">
                {isAdmin ? (
                  <Badge tone="ok">Administrator</Badge>
                ) : (
                  <Badge tone="muted">Vanlig bruker</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Bytt passord</h2>
          </div>
          <div className="card-pad">
            <form onSubmit={submit} className="stack-sm" style={{ maxWidth: 380 }}>
              {error ? <Alert>{error}</Alert> : null}

              <div className="field">
                <label htmlFor="current">Nåværende passord</label>
                <input
                  id="current"
                  className="input"
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="next">Nytt passord</label>
                <input
                  id="next"
                  className="input"
                  type="password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
                <span className="hint">Minst 6 tegn.</span>
              </div>
              <div className="field">
                <label htmlFor="repeat">Gjenta nytt passord</label>
                <input
                  id="repeat"
                  className="input"
                  type="password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
              </div>

              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Lagrer…" : "Endre passord"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
