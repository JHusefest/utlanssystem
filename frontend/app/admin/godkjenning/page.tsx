"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Alert, Badge, Empty, Loading, Modal, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, isOverdue, timeAgo } from "@/lib/format";
import type { Loan } from "@/lib/types";

type Decision = {
  loan: Loan;
  action: "reject" | "reject-return";
};

export default function ApprovalQueuePage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

  const [queue, setQueue] = useState<Loan[] | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/");
  }, [loading, isAdmin, router]);

  const load = useCallback(async () => {
    try {
      setQueue(await api<Loan[]>("/loans/queue"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å hente køen.");
      setQueue([]);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const requests = useMemo(
    () => (queue || []).filter((l) => l.status === "pending"),
    [queue]
  );
  const returns = useMemo(
    () => (queue || []).filter((l) => l.status === "return_pending"),
    [queue]
  );

  async function act(loan: Loan, path: string, message: string, body?: object) {
    setBusyId(loan.id);
    setError("");
    try {
      await api(`/loans/${loan.id}/${path}`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
      setToast(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Handlingen feilet.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitDecision() {
    if (!decision) return;
    const { loan, action } = decision;
    const message =
      action === "reject"
        ? `Avslått: ${loan.equipment.name}`
        : `Retur avvist: ${loan.equipment.name}`;
    setDecision(null);
    await act(loan, action, message, { note: note.trim() || null });
    setNote("");
  }

  if (loading || !isAdmin) {
    return (
      <div className="card">
        <Loading rows={3} />
      </div>
    );
  }

  const total = requests.length + returns.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Til godkjenning</h1>
          <p className="sub">
            {total === 0
              ? "Ingenting venter på deg akkurat nå."
              : `${total} ${total === 1 ? "sak" : "saker"} venter på behandling.`}
          </p>
        </div>
        <button className="btn" onClick={() => void load()}>
          Oppdater
        </button>
      </div>

      <div className="stack">
        {error ? <Alert>{error}</Alert> : null}

        <div className="card">
          <div className="card-head">
            <h2>Forespørsler om lån</h2>
            <span className="small muted">{requests.length}</span>
          </div>

          {queue === null ? (
            <Loading rows={3} />
          ) : requests.length === 0 ? (
            <Empty title="Ingen forespørsler">
              Alt er behandlet. Utstyret er ikke reservert av noen.
            </Empty>
          ) : (
            requests.map((loan) => (
              <div key={loan.id} className="queue-item">
                <div>
                  <div className="who">
                    {loan.user.full_name}
                    {loan.user.school_class ? (
                      <span className="muted small"> · {loan.user.school_class}</span>
                    ) : null}
                  </div>
                  <div className="what">
                    Ber om{" "}
                    {loan.quantity > 1 ? <strong>{loan.quantity} stk </strong> : null}
                    <Link href={`/utstyr/${loan.equipment.id}`} className="link">
                      {loan.equipment.name}
                    </Link>
                    {loan.equipment.serial_number ? (
                      <span className="mono"> ({loan.equipment.serial_number})</span>
                    ) : null}
                  </div>
                  <div className="what">
                    Forespurt {timeAgo(loan.borrowed_at)}
                    {loan.due_date ? ` · ønsker å levere innen ${formatDate(loan.due_date)}` : ""}
                  </div>
                  {loan.note ? (
                    <div className="what">
                      <em>«{loan.note}»</em>
                    </div>
                  ) : null}
                </div>

                <div className="actions">
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={busyId === loan.id}
                    onClick={() => {
                      setNote("");
                      setDecision({ loan, action: "reject" });
                    }}
                  >
                    Avslå
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busyId === loan.id}
                    onClick={() =>
                      void act(loan, "approve", `Godkjent: ${loan.equipment.name}`)
                    }
                  >
                    {busyId === loan.id ? "…" : "Godkjenn"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Returer til bekreftelse</h2>
            <span className="small muted">{returns.length}</span>
          </div>

          {queue === null ? (
            <Loading rows={3} />
          ) : returns.length === 0 ? (
            <Empty title="Ingen returer">
              Ingen har meldt inn at de har levert noe tilbake.
            </Empty>
          ) : (
            returns.map((loan) => (
              <div key={loan.id} className="queue-item">
                <div>
                  <div className="who">
                    {loan.user.full_name}
                    {loan.user.school_class ? (
                      <span className="muted small"> · {loan.user.school_class}</span>
                    ) : null}
                  </div>
                  <div className="what">
                    Melder at{" "}
                    {loan.quantity > 1 ? <strong>{loan.quantity} stk </strong> : null}
                    <Link href={`/utstyr/${loan.equipment.id}`} className="link">
                      {loan.equipment.name}
                    </Link>
                    {loan.equipment.serial_number ? (
                      <span className="mono"> ({loan.equipment.serial_number})</span>
                    ) : null}{" "}
                    er levert
                  </div>
                  <div className="what">
                    Meldt inn {timeAgo(loan.return_requested_at)} · lånt ut{" "}
                    {formatDate(loan.approved_at)}
                    {isOverdue(loan) ? " · var på overtid" : ""}
                  </div>
                </div>

                <div className="actions">
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={busyId === loan.id}
                    onClick={() => {
                      setNote("");
                      setDecision({ loan, action: "reject-return" });
                    }}
                  >
                    Står ikke i skapet
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busyId === loan.id}
                    onClick={() =>
                      void act(
                        loan,
                        "confirm-return",
                        `Retur bekreftet: ${loan.equipment.name}`
                      )
                    }
                  >
                    {busyId === loan.id ? "…" : "Bekreft levert"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <p className="small muted">
          Utstyr blir først ledig for andre når du har bekreftet returen. Forespørsler
          holder av utstyret mens de venter, så avslå det du ikke skal gjennomføre.
        </p>
      </div>

      {decision ? (
        <Modal
          title={decision.action === "reject" ? "Avslå forespørsel" : "Avvis retur"}
          onClose={() => setDecision(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDecision(null)}>
                Avbryt
              </button>
              <button className="btn btn-danger" onClick={() => void submitDecision()}>
                {decision.action === "reject" ? "Avslå" : "Avvis retur"}
              </button>
            </>
          }
        >
          <div className="stack-sm">
            <p className="small">
              {decision.action === "reject" ? (
                <>
                  <strong>{decision.loan.user.full_name}</strong> får ikke låne{" "}
                  <strong>{decision.loan.equipment.name}</strong>. Utstyret blir ledig
                  for andre med en gang.
                </>
              ) : (
                <>
                  Lånet på <strong>{decision.loan.equipment.name}</strong> settes tilbake
                  til aktivt, og{" "}
                  <strong>{decision.loan.user.full_name}</strong> står fortsatt som
                  ansvarlig.
                </>
              )}
            </p>

            <div className="field">
              <label htmlFor="note">Begrunnelse</label>
              <textarea
                id="note"
                className="textarea"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  decision.action === "reject"
                    ? "F.eks. «Reservert til eksamen denne uka»"
                    : "F.eks. «Fant den ikke i skap A»"
                }
                autoFocus
              />
              <span className="hint">
                Valgfritt, men låntakeren ser den på «Mine lån».
              </span>
            </div>
          </div>
        </Modal>
      ) : null}

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
