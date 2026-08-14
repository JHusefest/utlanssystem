"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Alert, Badge, Empty, Loading, Modal, Toast } from "@/components/ui";
import { api, download } from "@/lib/api";
import { availabilityLabel, statusTone } from "@/lib/format";
import type { Equipment, EquipmentStatus, ImportResult, TrackingType } from "@/lib/types";

interface FormState {
  name: string;
  category: string;
  description: string;
  location: string;
  tracking_type: TrackingType;
  serial_number: string;
  asset_tag: string;
  status: EquipmentStatus;
  quantity_total: number;
}

const EMPTY: FormState = {
  name: "",
  category: "",
  description: "",
  location: "",
  tracking_type: "unique",
  serial_number: "",
  asset_tag: "",
  status: "available",
  quantity_total: 1,
};

export default function AdminEquipmentPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<Equipment[] | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Equipment | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/");
  }, [loading, isAdmin, router]);

  const load = useCallback(async () => {
    try {
      setItems(await api<Equipment[]>("/equipment", { auth: false }));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å hente utstyr.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const rows = useMemo(() => {
    if (!items) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) =>
      [i.name, i.category, i.serial_number, i.asset_tag, i.location]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle))
    );
  }, [items, search]);

  function openCreate() {
    setForm(EMPTY);
    setFormError("");
    setCreating(true);
  }

  function openEdit(item: Equipment) {
    setForm({
      name: item.name,
      category: item.category || "",
      description: item.description || "",
      location: item.location || "",
      tracking_type: item.tracking_type,
      serial_number: item.serial_number || "",
      asset_tag: item.asset_tag || "",
      status: item.status,
      quantity_total: item.quantity_total,
    });
    setFormError("");
    setEditing(item);
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

    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      tracking_type: form.tracking_type,
      serial_number:
        form.tracking_type === "unique" ? form.serial_number.trim() || null : null,
      asset_tag: form.asset_tag.trim() || null,
      status: form.status,
      quantity_total:
        form.tracking_type === "quantity" ? Number(form.quantity_total) || 0 : 1,
    };

    try {
      if (editing) {
        await api(`/equipment/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setToast("Utstyret er oppdatert.");
      } else {
        await api("/equipment", { method: "POST", body: JSON.stringify(payload) });
        setToast("Utstyret er registrert.");
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
      await api(`/equipment/${confirmDelete.id}`, { method: "DELETE" });
      setToast("Utstyret er slettet.");
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Klarte ikke å slette.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const result = await api<ImportResult>("/equipment/import", {
        method: "POST",
        body: data,
      });
      setImportResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Importen feilet.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
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
          <h1>Administrer utstyr</h1>
          <p className="sub">Registrer nytt utstyr eller importer fra Excel.</p>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() => void download("/equipment/import/template", "utstyr-mal.xlsx")}
          >
            Last ned Excel-mal
          </button>
          <button
            className="btn"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? "Importerer…" : "Importer Excel"}
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            Nytt utstyr
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xlsm"
        onChange={handleImport}
        style={{ display: "none" }}
      />

      <div className="stack">
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Søk etter navn, serienummer, plassering…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Søk"
          />
          <span className="small muted">{rows.length} rader</span>
        </div>

        {error ? <Alert>{error}</Alert> : null}

        <div className="card">
          {items === null ? (
            <Loading rows={4} />
          ) : rows.length === 0 ? (
            <Empty title="Ingen utstyr registrert">
              Bruk «Importer Excel» eller legg til manuelt.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Navn</th>
                    <th>Kategori</th>
                    <th>Serienr.</th>
                    <th>Plassering</th>
                    <th>Tilgjengelighet</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="cell-main">{item.name}</div>
                        <div className="cell-sub">
                          {item.tracking_type === "unique"
                            ? "Unik enhet"
                            : `${item.quantity_total} stk totalt`}
                        </div>
                      </td>
                      <td>{item.category || "–"}</td>
                      <td className="mono">{item.serial_number || "–"}</td>
                      <td>{item.location || "–"}</td>
                      <td>
                        <Badge tone={statusTone(item)}>{availabilityLabel(item)}</Badge>
                      </td>
                      <td className="right nowrap">
                        <button className="btn btn-sm" onClick={() => openEdit(item)}>
                          Rediger
                        </button>{" "}
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            setFormError("");
                            setConfirmDelete(item);
                          }}
                        >
                          Slett
                        </button>
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
          title={editing ? "Rediger utstyr" : "Nytt utstyr"}
          onClose={closeForm}
          footer={
            <>
              <button type="button" className="btn" onClick={closeForm} disabled={busy}>
                Avbryt
              </button>
              <button
                type="submit"
                form="equipment-form"
                className="btn btn-primary"
                disabled={busy}
              >
                {busy ? "Lagrer…" : "Lagre"}
              </button>
            </>
          }
        >
          <form id="equipment-form" onSubmit={submit} className="stack-sm">
            {formError ? <Alert>{formError}</Alert> : null}

            <div className="field">
              <label htmlFor="name">Navn</label>
              <input
                id="name"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="tracking">Sporing</label>
                <select
                  id="tracking"
                  className="select"
                  value={form.tracking_type}
                  onChange={(e) =>
                    setForm({ ...form, tracking_type: e.target.value as TrackingType })
                  }
                >
                  <option value="unique">Unik enhet (serienummer)</option>
                  <option value="quantity">Antallsbasert (bulk)</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="category">Kategori</label>
                <input
                  id="category"
                  className="input"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="F.eks. Bærbar PC"
                />
              </div>

              {form.tracking_type === "unique" ? (
                <>
                  <div className="field">
                    <label htmlFor="serial">Serienummer</label>
                    <input
                      id="serial"
                      className="input"
                      value={form.serial_number}
                      onChange={(e) =>
                        setForm({ ...form, serial_number: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="tag">Merkelapp</label>
                    <input
                      id="tag"
                      className="input"
                      value={form.asset_tag}
                      onChange={(e) => setForm({ ...form, asset_tag: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <div className="field">
                  <label htmlFor="qty">Antall totalt</label>
                  <input
                    id="qty"
                    className="input"
                    type="number"
                    min={0}
                    value={form.quantity_total}
                    onChange={(e) =>
                      setForm({ ...form, quantity_total: Number(e.target.value) })
                    }
                    required
                  />
                </div>
              )}

              <div className="field">
                <label htmlFor="location">Plassering</label>
                <input
                  id="location"
                  className="input"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="F.eks. Skap A, hylle 1"
                />
              </div>

              <div className="field">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  className="select"
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as EquipmentStatus })
                  }
                >
                  <option value="available">Ledig</option>
                  <option value="maintenance">Til service</option>
                  <option value="retired">Utrangert</option>
                  {form.status === "on_loan" ? (
                    <option value="on_loan">Utlånt</option>
                  ) : null}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="description">Beskrivelse</label>
              <textarea
                id="description"
                className="textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmDelete ? (
        <Modal
          title="Slette utstyr?"
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
                {busy ? "Sletter…" : "Slett"}
              </button>
            </>
          }
        >
          <div className="stack-sm">
            {formError ? <Alert>{formError}</Alert> : null}
            <p>
              <strong>{confirmDelete.name}</strong> blir slettet permanent, sammen med
              lånehistorikken.
            </p>
            <p className="small muted">
              Skal utstyret bare tas ut av bruk? Sett status til «Utrangert» i stedet.
            </p>
          </div>
        </Modal>
      ) : null}

      {importResult ? (
        <Modal
          title="Import fullført"
          onClose={() => setImportResult(null)}
          footer={
            <button className="btn btn-primary" onClick={() => setImportResult(null)}>
              Lukk
            </button>
          }
        >
          <div className="stack-sm">
            <div className="stats">
              <div className="stat">
                <div className="label">Nye</div>
                <div className="value">{importResult.created}</div>
              </div>
              <div className="stat">
                <div className="label">Oppdatert</div>
                <div className="value">{importResult.updated}</div>
              </div>
              <div className="stat">
                <div className="label">Hoppet over</div>
                <div className="value">{importResult.skipped}</div>
              </div>
            </div>

            {importResult.errors.length > 0 ? (
              <>
                <p className="small muted" style={{ marginTop: 6 }}>
                  Merknader fra importen:
                </p>
                <div
                  className="card card-pad small"
                  style={{ maxHeight: 220, overflowY: "auto", boxShadow: "none" }}
                >
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {importResult.errors.map((e, i) => (
                      <li key={i}>
                        <strong>Rad {e.row}:</strong> {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <Alert tone="ok">Alle rader ble lest uten problemer.</Alert>
            )}
          </div>
        </Modal>
      ) : null}

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
