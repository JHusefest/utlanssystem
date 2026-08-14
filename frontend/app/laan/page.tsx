"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Badge, Empty, Loading, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import type { Loan } from "@/lib/types";

type Tab = "active" | "history";

export default function LoansPage() {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("active");
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoans(await api<Loan[]>("/loans", { auth: false }));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å hente lån.");
      setLoans([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!loans) return [];
    const needle = search.trim().toLowerCase();
    return loans
      .filter((l) => (tab === "active" ? l.is_active : !l.is_active))
      .filter((l) => {
        if (!needle) return true;
        return [l.equipment.name, l.equipment.serial_number, l.user.full_name, l.user.school_class]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(needle));
      });
  }, [loans, tab, search]);

  const overdueCount = useMemo(
    () => (loans || []).filter((l) => isOverdue(l)).length,
    [loans]
  );

  async function handleReturn(loan: Loan) {
    setBusyId(loan.id);
    try {
      await api(`/loans/${loan.id}/return`, { method: "POST" });
      setToast(`Retur registrert: ${loan.equipment.name}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å registrere retur.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lån</h1>
          <p className="sub">
            Hvem har hva.
            {overdueCount > 0 ? ` ${overdueCount} lån er på overtid.` : ""}
          </p>
        </div>
      </div>

      <div className="stack">
        <div className="toolbar">
          <div className="tabs">
            <button
              className={tab === "active" ? "active" : ""}
              onClick={() => setTab("active")}
            >
              Aktive
            </button>
            <button
              className={tab === "history" ? "active" : ""}
              onClick={() => setTab("history")}
            >
              Historikk
            </button>
          </div>
          <input
            className="input search"
            placeholder="Søk etter utstyr eller person…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Søk"
          />
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="card">
          {loans === null ? (
            <Loading rows={4} />
          ) : rows.length === 0 ? (
            <Empty title={tab === "active" ? "Ingen aktive lån" : "Ingen historikk"}>
              {tab === "active"
                ? "Alt utstyr står i skapet."
                : "Ingen lån er levert tilbake ennå."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Utstyr</th>
                    <th>Lånt av</th>
                    <th>Antall</th>
                    <th>Lånt ut</th>
                    <th>{tab === "active" ? "Frist" : "Levert"}</th>
                    {tab === "active" ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((loan) => (
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
                      <td>
                        <div className="cell-main">{loan.user.full_name}</div>
                        {loan.user.school_class ? (
                          <div className="cell-sub">{loan.user.school_class}</div>
                        ) : null}
                      </td>
                      <td className="nowrap">{loan.quantity} stk</td>
                      <td className="nowrap">{formatDate(loan.borrowed_at)}</td>
                      <td className="nowrap">
                        {tab === "active" ? (
                          isOverdue(loan) ? (
                            <Badge tone="warn">
                              På overtid · {formatDate(loan.due_date)}
                            </Badge>
                          ) : (
                            formatDate(loan.due_date)
                          )
                        ) : (
                          formatDateTime(loan.returned_at)
                        )}
                      </td>
                      {tab === "active" ? (
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
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!user ? (
          <p className="small muted">
            <Link href="/login" className="link">
              Logg inn
            </Link>{" "}
            for å levere inn utstyr.
          </p>
        ) : null}
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
