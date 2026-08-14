"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { LoanDialog } from "@/components/LoanDialog";
import { Badge, Empty, Loading, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import {
  availabilityLabel,
  formatDate,
  formatDateTime,
  isOverdue,
  statusTone,
} from "@/lib/format";
import type { Equipment, Loan } from "@/lib/types";

export default function EquipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user, isAdmin } = useAuth();

  const [item, setItem] = useState<Equipment | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [error, setError] = useState("");
  const [showLoan, setShowLoan] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [eq, ln] = await Promise.all([
        api<Equipment>(`/equipment/${id}`, { auth: false }),
        api<Loan[]>(`/loans?equipment_id=${id}`, { auth: false }),
      ]);
      setItem(eq);
      setLoans(ln);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å hente utstyret.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReturn(loan: Loan) {
    setBusyId(loan.id);
    try {
      await api(`/loans/${loan.id}/return`, { method: "POST" });
      setToast("Tilbakelevering registrert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å registrere retur.");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !item) {
    return (
      <div className="card">
        <Empty title="Fant ikke utstyret">
          <Link href="/" className="link">
            Tilbake til oversikten
          </Link>
        </Empty>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="card">
        <Loading rows={5} />
      </div>
    );
  }

  const active = loans.filter((l) => l.is_active);
  const history = loans.filter((l) => !l.is_active);

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/" className="small link">
            ← Alt utstyr
          </Link>
          <h1 style={{ marginTop: 6 }}>{item.name}</h1>
          <p className="sub">
            {item.category || "Uten kategori"}
            {item.location ? ` · ${item.location}` : ""}
          </p>
        </div>
        <div className="row">
          <Badge tone={statusTone(item)}>{availabilityLabel(item)}</Badge>
          {user && item.is_available ? (
            <button className="btn btn-primary" onClick={() => setShowLoan(true)}>
              Registrer lån
            </button>
          ) : null}
        </div>
      </div>

      <div className="stack">
        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="card card-pad">
          <div className="detail-grid">
            <div>
              <div className="k">Type</div>
              <div className="v">
                {item.tracking_type === "unique" ? "Unik enhet" : "Antallsbasert"}
              </div>
            </div>
            {item.serial_number ? (
              <div>
                <div className="k">Serienummer</div>
                <div className="v mono">{item.serial_number}</div>
              </div>
            ) : null}
            {item.asset_tag ? (
              <div>
                <div className="k">Merkelapp</div>
                <div className="v mono">{item.asset_tag}</div>
              </div>
            ) : null}
            {item.tracking_type === "quantity" ? (
              <>
                <div>
                  <div className="k">Totalt</div>
                  <div className="v">{item.quantity_total} stk</div>
                </div>
                <div>
                  <div className="k">Utlånt</div>
                  <div className="v">{item.quantity_on_loan} stk</div>
                </div>
              </>
            ) : null}
            <div>
              <div className="k">Plassering</div>
              <div className="v">{item.location || "–"}</div>
            </div>
          </div>

          {item.description ? (
            <p className="muted small" style={{ marginTop: 16 }}>
              {item.description}
            </p>
          ) : null}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Aktive lån</h2>
            <span className="small muted">{active.length}</span>
          </div>
          {active.length === 0 ? (
            <Empty title="Ingen aktive lån">Alt er på plass i skapet.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lånt av</th>
                    <th>Antall</th>
                    <th>Lånt ut</th>
                    <th>Frist</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {active.map((loan) => (
                    <tr key={loan.id}>
                      <td>
                        <div className="cell-main">{loan.user.full_name}</div>
                        {loan.user.school_class ? (
                          <div className="cell-sub">{loan.user.school_class}</div>
                        ) : null}
                      </td>
                      <td className="nowrap">{loan.quantity} stk</td>
                      <td className="nowrap">{formatDate(loan.borrowed_at)}</td>
                      <td className="nowrap">
                        {isOverdue(loan) ? (
                          <Badge tone="warn">{formatDate(loan.due_date)}</Badge>
                        ) : (
                          formatDate(loan.due_date)
                        )}
                      </td>
                      <td className="right">
                        {user && (isAdmin || loan.user.id === user.id) ? (
                          <button
                            className="btn btn-sm"
                            onClick={() => handleReturn(loan)}
                            disabled={busyId === loan.id}
                          >
                            {busyId === loan.id ? "…" : "Registrer retur"}
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

        {history.length > 0 ? (
          <div className="card">
            <div className="card-head">
              <h2>Historikk</h2>
              <span className="small muted">{history.length}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lånt av</th>
                    <th>Antall</th>
                    <th>Lånt ut</th>
                    <th>Levert</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 25).map((loan) => (
                    <tr key={loan.id}>
                      <td className="cell-main">{loan.user.full_name}</td>
                      <td className="nowrap">{loan.quantity} stk</td>
                      <td className="nowrap">{formatDate(loan.borrowed_at)}</td>
                      <td className="nowrap">{formatDateTime(loan.returned_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {showLoan ? (
        <LoanDialog
          item={item}
          onClose={() => setShowLoan(false)}
          onDone={(message) => {
            setShowLoan(false);
            setToast(message);
            void load();
          }}
        />
      ) : null}

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
