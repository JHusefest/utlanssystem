"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { LoanDialog } from "@/components/LoanDialog";
import { Badge, Empty, Loading, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import {
  LOAN_STATUS_LABEL,
  LOAN_STATUS_TONE,
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

  async function act(loan: Loan, path: string, message: string) {
    setBusyId(loan.id);
    try {
      await api(`/loans/${loan.id}/${path}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setToast(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Handlingen feilet.");
    } finally {
      setBusyId(null);
    }
  }

  function actionFor(loan: Loan) {
    if (!user) return null;
    const mine = loan.user.id === user.id;

    if (isAdmin && (loan.status === "active" || loan.status === "return_pending")) {
      return (
        <button
          className="btn btn-sm"
          disabled={busyId === loan.id}
          onClick={() =>
            void act(loan, "confirm-return", `Retur registrert: ${loan.equipment.name}`)
          }
        >
          {busyId === loan.id ? "…" : "Registrer retur"}
        </button>
      );
    }
    if (isAdmin && loan.status === "pending") {
      return (
        <Link href="/admin/godkjenning" className="btn btn-sm btn-primary">
          Behandle
        </Link>
      );
    }
    if (mine && loan.status === "active") {
      return (
        <button
          className="btn btn-sm"
          disabled={busyId === loan.id}
          onClick={() =>
            void act(loan, "request-return", `Retur meldt inn: ${loan.equipment.name}`)
          }
        >
          {busyId === loan.id ? "…" : "Meld inn retur"}
        </button>
      );
    }
    if (mine && loan.status === "pending") {
      return (
        <button
          className="btn btn-sm"
          disabled={busyId === loan.id}
          onClick={() => void act(loan, "cancel", "Forespørsel trukket.")}
        >
          {busyId === loan.id ? "…" : "Trekk"}
        </button>
      );
    }
    return null;
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

  const open = loans.filter((l) => l.is_open);
  const history = loans.filter((l) => !l.is_open);

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
              {isAdmin ? "Registrer lån" : "Be om å låne"}
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
                  <div className="v">{item.units_total} stk</div>
                </div>
                <div>
                  <div className="k">Ute</div>
                  <div className="v">{item.quantity_on_loan} stk</div>
                </div>
                <div>
                  <div className="k">Reservert</div>
                  <div className="v">{item.quantity_reserved} stk</div>
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
            <h2>Åpne saker</h2>
            <span className="small muted">{open.length}</span>
          </div>
          {open.length === 0 ? (
            <Empty title="Ingen aktive lån">Alt er på plass i skapet.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Antall</th>
                    <th>Status</th>
                    <th>Frist</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {open.map((loan) => (
                    <tr key={loan.id}>
                      <td>
                        <div className="cell-main">{loan.user.full_name}</div>
                        {loan.user.school_class ? (
                          <div className="cell-sub">{loan.user.school_class}</div>
                        ) : null}
                      </td>
                      <td className="nowrap">{loan.quantity} stk</td>
                      <td>
                        <Badge tone={LOAN_STATUS_TONE[loan.status]}>
                          {LOAN_STATUS_LABEL[loan.status]}
                        </Badge>
                      </td>
                      <td className="nowrap">
                        {isOverdue(loan) ? (
                          <Badge tone="warn">{formatDate(loan.due_date)}</Badge>
                        ) : (
                          formatDate(loan.due_date)
                        )}
                      </td>
                      <td className="right">{actionFor(loan)}</td>
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
                    <th>Person</th>
                    <th>Antall</th>
                    <th>Status</th>
                    <th>Avsluttet</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 25).map((loan) => (
                    <tr key={loan.id}>
                      <td className="cell-main">{loan.user.full_name}</td>
                      <td className="nowrap">{loan.quantity} stk</td>
                      <td>
                        <Badge tone={LOAN_STATUS_TONE[loan.status]}>
                          {LOAN_STATUS_LABEL[loan.status]}
                        </Badge>
                      </td>
                      <td className="nowrap">
                        {formatDateTime(loan.returned_at ?? loan.approved_at)}
                      </td>
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
