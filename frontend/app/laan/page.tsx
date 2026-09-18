"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Badge, Empty, Loading, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import {
  LOAN_STATUS_SHORT,
  LOAN_STATUS_TONE,
  formatDate,
  formatDateTime,
  isOverdue,
} from "@/lib/format";
import type { Loan } from "@/lib/types";

type Tab = "out" | "queue" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "out", label: "Ute nå" },
  { key: "queue", label: "Til godkjenning" },
  { key: "history", label: "Historikk" },
];

export default function LoansPage() {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("out");
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

  const counts = useMemo(() => {
    const all = loans || [];
    return {
      out: all.filter((l) => l.is_out).length,
      queue: all.filter((l) => l.needs_admin).length,
      history: all.filter((l) => !l.is_open).length,
      overdue: all.filter((l) => isOverdue(l)).length,
    };
  }, [loans]);

  const rows = useMemo(() => {
    if (!loans) return [];
    const needle = search.trim().toLowerCase();
    return loans
      .filter((l) =>
        tab === "out" ? l.is_out : tab === "queue" ? l.needs_admin : !l.is_open
      )
      .filter((l) => {
        if (!needle) return true;
        return [
          l.equipment.name,
          l.equipment.serial_number,
          l.user.full_name,
          l.user.school_class,
        ]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(needle));
      });
  }, [loans, tab, search]);

  async function handleAction(loan: Loan, path: string, message: string) {
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
            void handleAction(
              loan,
              "confirm-return",
              `Retur registrert: ${loan.equipment.name}`
            )
          }
        >
          {busyId === loan.id ? "…" : "Registrer retur"}
        </button>
      );
    }

    if (mine && loan.status === "active") {
      return (
        <button
          className="btn btn-sm"
          disabled={busyId === loan.id}
          onClick={() =>
            void handleAction(
              loan,
              "request-return",
              `Retur meldt inn: ${loan.equipment.name}`
            )
          }
        >
          {busyId === loan.id ? "…" : "Meld inn retur"}
        </button>
      );
    }

    return null;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lån</h1>
          <p className="sub">
            Hvem har hva.
            {counts.overdue > 0 ? ` ${counts.overdue} lån er på overtid.` : ""}
          </p>
        </div>
        {isAdmin && counts.queue > 0 ? (
          <Link href="/admin/godkjenning" className="btn btn-primary">
            Behandle {counts.queue} {counts.queue === 1 ? "sak" : "saker"}
          </Link>
        ) : null}
      </div>

      <div className="stack">
        <div className="toolbar">
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? "active" : ""}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {counts[t.key] ? ` (${counts[t.key]})` : ""}
              </button>
            ))}
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
            <Empty
              title={
                tab === "out"
                  ? "Ingenting er utlånt"
                  : tab === "queue"
                    ? "Ingenting venter på godkjenning"
                    : "Ingen historikk"
              }
            >
              {tab === "out"
                ? "Alt utstyr står i skapet."
                : tab === "queue"
                  ? "Alle forespørsler og returer er behandlet."
                  : "Ingen lån er avsluttet ennå."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Utstyr</th>
                    <th>Person</th>
                    <th>Antall</th>
                    <th>Status</th>
                    <th>{tab === "history" ? "Avsluttet" : "Frist"}</th>
                    <th />
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
                      <td>
                        <Badge tone={LOAN_STATUS_TONE[loan.status]}>
                          {LOAN_STATUS_SHORT[loan.status]}
                        </Badge>
                      </td>
                      <td className="nowrap">
                        {tab === "history" ? (
                          formatDateTime(loan.returned_at ?? loan.approved_at)
                        ) : isOverdue(loan) ? (
                          <Badge tone="warn">
                            På overtid · {formatDate(loan.due_date)}
                          </Badge>
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

        {!user ? (
          <p className="small muted">
            <Link href="/login" className="link">
              Logg inn
            </Link>{" "}
            for å be om lån eller melde inn retur.
          </p>
        ) : null}
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
