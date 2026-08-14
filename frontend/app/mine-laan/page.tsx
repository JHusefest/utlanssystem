"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Badge, Empty, Loading, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
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

  async function handleReturn(loan: Loan) {
    setBusyId(loan.id);
    try {
      await api(`/loans/${loan.id}/return`, { method: "POST" });
      setToast(`Levert inn: ${loan.equipment.name}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å registrere retur.");
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

  const active = (loans || []).filter((l) => l.is_active);
  const history = (loans || []).filter((l) => !l.is_active);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mine lån</h1>
          <p className="sub">Utstyr du har ute nå, og det du har levert tilbake.</p>
        </div>
        <Link href="/" className="btn btn-primary">
          Lån nytt utstyr
        </Link>
      </div>

      <div className="stack">
        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="card">
          <div className="card-head">
            <h2>Ute nå</h2>
            <span className="small muted">{active.length}</span>
          </div>
          {loans === null ? (
            <Loading rows={3} />
          ) : active.length === 0 ? (
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
                    <th>Lånt ut</th>
                    <th>Frist</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {active.map((loan) => (
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
                      <td className="nowrap">{formatDate(loan.borrowed_at)}</td>
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
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleReturn(loan)}
                          disabled={busyId === loan.id}
                        >
                          {busyId === loan.id ? "…" : "Lever tilbake"}
                        </button>
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
              <h2>Tidligere lån</h2>
              <span className="small muted">{history.length}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Utstyr</th>
                    <th>Antall</th>
                    <th>Lånt ut</th>
                    <th>Levert</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 30).map((loan) => (
                    <tr key={loan.id}>
                      <td className="cell-main">{loan.equipment.name}</td>
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

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
