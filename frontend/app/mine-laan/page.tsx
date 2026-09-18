"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Alert, Badge, Empty, Loading, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import {
  LOAN_STATUS_LABEL,
  LOAN_STATUS_TONE,
  formatDate,
  formatDateTime,
  isOverdue,
  timeAgo,
} from "@/lib/format";
import type { Loan } from "@/lib/types";

export default function MyLoansPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoans(await api<Loan[]>("/loans/mine"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å hente lånene dine.");
      setLoans([]);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const { waiting, out, history } = useMemo(() => {
    const all = loans || [];
    return {
      waiting: all.filter((l) => l.status === "pending"),
      out: all.filter((l) => l.is_out),
      history: all.filter((l) => !l.is_open),
    };
  }, [loans]);

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
          <h1>Mine lån</h1>
          <p className="sub">Det du venter på, det du har ute, og det du har levert.</p>
        </div>
        <Link href="/" className="btn btn-primary">
          Be om nytt utstyr
        </Link>
      </div>

      <div className="stack">
        {error ? <Alert>{error}</Alert> : null}

        {waiting.length > 0 ? (
          <div className="card">
            <div className="card-head">
              <h2>Venter på godkjenning</h2>
              <span className="small muted">{waiting.length}</span>
            </div>
            {waiting.map((loan) => (
              <div key={loan.id} className="queue-item">
                <div>
                  <div className="who">
                    <Link href={`/utstyr/${loan.equipment.id}`}>
                      {loan.equipment.name}
                    </Link>
                    {loan.quantity > 1 ? (
                      <span className="muted small"> · {loan.quantity} stk</span>
                    ) : null}
                  </div>
                  <div className="what">
                    Sendt {timeAgo(loan.borrowed_at)} · en lærer må godkjenne før du
                    kan hente den
                  </div>
                </div>
                <div className="actions">
                  <button
                    className="btn btn-sm"
                    disabled={busyId === loan.id}
                    onClick={() =>
                      void act(loan, "cancel", `Forespørsel trukket: ${loan.equipment.name}`)
                    }
                  >
                    {busyId === loan.id ? "…" : "Trekk forespørsel"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="card">
          <div className="card-head">
            <h2>Ute nå</h2>
            <span className="small muted">{out.length}</span>
          </div>
          {loans === null ? (
            <Loading rows={3} />
          ) : out.length === 0 ? (
            <Empty title="Du har ingenting utlånt">
              <Link href="/" className="link">
                Se hva som er ledig
              </Link>
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Utstyr</th>
                    <th>Antall</th>
                    <th>Status</th>
                    <th>Frist</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {out.map((loan) => (
                    <tr key={loan.id}>
                      <td>
                        <Link href={`/utstyr/${loan.equipment.id}`} className="cell-main">
                          {loan.equipment.name}
                        </Link>
                        {loan.equipment.serial_number ? (
                          <div className="cell-sub mono">
                            {loan.equipment.serial_number}
                          </div>
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
                          <Badge tone="warn">
                            På overtid · {formatDate(loan.due_date)}
                          </Badge>
                        ) : (
                          formatDate(loan.due_date)
                        )}
                      </td>
                      <td className="right">
                        {loan.status === "active" ? (
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={busyId === loan.id}
                            onClick={() =>
                              void act(
                                loan,
                                "request-return",
                                `Retur meldt inn: ${loan.equipment.name}`
                              )
                            }
                          >
                            {busyId === loan.id ? "…" : "Meld inn retur"}
                          </button>
                        ) : (
                          <span className="small muted nowrap">
                            Venter på bekreftelse
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {out.some((l) => l.status === "return_pending") ? (
          <p className="small muted">
            Utstyr du har meldt inn står som ditt ansvar til en lærer har sett at det er
            på plass i skapet.
          </p>
        ) : null}

        {history.length > 0 ? (
          <div className="card">
            <div className="card-head">
              <h2>Tidligere</h2>
              <span className="small muted">{history.length}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Utstyr</th>
                    <th>Antall</th>
                    <th>Status</th>
                    <th>Avsluttet</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 30).map((loan) => (
                    <tr key={loan.id}>
                      <td>
                        <div className="cell-main">{loan.equipment.name}</div>
                        {loan.decision_note ? (
                          <div className="cell-sub">«{loan.decision_note}»</div>
                        ) : null}
                      </td>
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

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
