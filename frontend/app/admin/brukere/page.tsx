"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Alert, Badge, Empty, Loading, Modal, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Role, User } from "@/lib/types";

interface FormState {
  username: string;
  full_name: string;
  email: string;
  school_class: string;
  role: Role;
  is_active: boolean;
  password: string;
}

const EMPTY: FormState = {
  username: "",
  full_name: "",
  email: "",
  school_class: "",
  role: "user",
  is_active: true,
  password: "",
};

export default function AdminUsersPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<User[] | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/");
  }, [loading, isAdmin, router]);

  const load = useCallback(async () => {
    try {
      setUsers(await api<User[]>("/users"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å hente brukere.");
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const rows = useMemo(() => {
    if (!users) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) =>
      [u.full_name, u.username, u.email, u.school_class]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle))
    );
  }, [users, search]);

  function openCreate() {
    setForm(EMPTY);
    setFormError("");
    setCreating(true);
  }

  function openEdit(u: User) {
    setForm({
      username: u.username,
      full_name: u.full_name,
      email: u.email || "",
      school_class: u.school_class || "",
      role: u.role,
      is_active: u.is_active,
      password: "",
    });
    setFormError("");
    setEditing(u);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");

    const payload: Record<string, unknown> = {
      username: form.username.trim(),
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      school_class: form.school_class.trim() || null,
      role: form.role,
      is_active: form.is_active,
    };

    try {
      if (editing) {
        if (form.password) payload.password = form.password;
        await api(`/users/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setToast("Brukeren er oppdatert.");
      } else {
        payload.password = form.password;
        await api("/users", { method: "POST", body: JSON.stringify(payload) });
        setToast("Brukeren er opprettet.");
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Klarte ikke å lagre.");
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await api(`/users/${confirmDelete.id}`, { method: "DELETE" });
      setToast("Brukeren er slettet.");
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Klarte ikke å slette.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !isAdmin) {
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
          <h1>Brukere</h1>
          <p className="sub">Opprett, oppdater og slett brukere.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          Ny bruker
        </button>
      </div>

      <div className="stack">
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Søk etter navn, brukernavn eller klasse…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Søk"
          />
        </div>

        {error ? <Alert>{error}</Alert> : null}

        <div className="card">
          {users === null ? (
            <Loading rows={4} />
          ) : rows.length === 0 ? (
            <Empty title="Ingen brukere">Opprett den første brukeren.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Navn</th>
                    <th>Brukernavn</th>
                    <th>Klasse</th>
                    <th>Rolle</th>
                    <th>Status</th>
                    <th>Opprettet</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="cell-main">{u.full_name}</div>
                        {u.email ? <div className="cell-sub">{u.email}</div> : null}
                      </td>
                      <td className="mono">{u.username}</td>
                      <td>{u.school_class || "–"}</td>
                      <td>
                        {u.role === "admin" ? (
                          <Badge tone="ok">Administrator</Badge>
                        ) : (
                          <Badge tone="muted">Bruker</Badge>
                        )}
                      </td>
                      <td>
                        {u.is_active ? (
                          <span className="small muted">Aktiv</span>
                        ) : (
                          <Badge tone="bad">Deaktivert</Badge>
                        )}
                      </td>
                      <td className="nowrap small muted">{formatDate(u.created_at)}</td>
                      <td className="right nowrap">
                        <button className="btn btn-sm" onClick={() => openEdit(u)}>
                          Rediger
                        </button>{" "}
                        {u.id !== user?.id ? (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              setFormError("");
                              setConfirmDelete(u);
                            }}
                          >
                            Slett
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {creating || editing ? (
        <Modal
          title={editing ? "Rediger bruker" : "Ny bruker"}
          onClose={closeForm}
          footer={
            <>
              <button type="button" className="btn" onClick={closeForm} disabled={busy}>
                Avbryt
              </button>
              <button
                type="submit"
                form="user-form"
                className="btn btn-primary"
                disabled={busy}
              >
                {busy ? "Lagrer…" : "Lagre"}
              </button>
            </>
          }
        >
          <form id="user-form" onSubmit={submit} className="stack-sm">
            {formError ? <Alert>{formError}</Alert> : null}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="full_name">Fullt navn</label>
                <input
                  id="full_name"
                  className="input"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="username">Brukernavn</label>
                <input
                  id="username"
                  className="input"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  autoCapitalize="none"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="school_class">Klasse</label>
                <input
                  id="school_class"
                  className="input"
                  value={form.school_class}
                  onChange={(e) => setForm({ ...form, school_class: e.target.value })}
                  placeholder="F.eks. 2IMB"
                />
              </div>
              <div className="field">
                <label htmlFor="email">E-post</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="role">Rolle</label>
                <select
                  id="role"
                  className="select"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                >
                  <option value="user">Vanlig bruker</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="password">
                  {editing ? "Nytt passord" : "Passord"}
                </label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={editing && !form.password ? undefined : 6}
                  required={!editing}
                  autoComplete="new-password"
                />
                <span className="hint">
                  {editing ? "La stå tomt for å beholde passordet." : "Minst 6 tegn."}
                </span>
              </div>
            </div>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Aktiv (kan logge inn)
            </label>
          </form>
        </Modal>
      ) : null}

      {confirmDelete ? (
        <Modal
          title="Slette bruker?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button
                className="btn"
                onClick={() => setConfirmDelete(null)}
                disabled={busy}
              >
                Avbryt
              </button>
              <button className="btn btn-danger" onClick={doDelete} disabled={busy}>
                {busy ? "Sletter…" : "Slett bruker"}
              </button>
            </>
          }
        >
          <div className="stack-sm">
            {formError ? <Alert>{formError}</Alert> : null}
            <p>
              <strong>{confirmDelete.full_name}</strong> blir slettet permanent.
              Lånehistorikken til brukeren forsvinner også.
            </p>
            <p className="small muted">
              Tips: vil du bare stenge tilgangen, kan du redigere brukeren og fjerne
              haken for «Aktiv» i stedet.
            </p>
          </div>
        </Modal>
      ) : null}

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
