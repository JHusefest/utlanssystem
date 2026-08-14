"use client";

import { useState } from "react";

import { api } from "@/lib/api";
import { dateInputValue } from "@/lib/format";
import type { Equipment } from "@/lib/types";

import { Alert, Modal } from "./ui";

export function LoanDialog({
  item,
  onClose,
  onDone,
}: {
  item: Equipment;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [dueDate, setDueDate] = useState(dateInputValue(7));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const maxQty = Math.max(item.quantity_available, 1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/loans", {
        method: "POST",
        body: JSON.stringify({
          equipment_id: item.id,
          quantity: item.tracking_type === "unique" ? 1 : quantity,
          // Sett forfall til slutten av dagen
          due_date: dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : null,
          note: note.trim() || null,
        }),
      });
      onDone(`Lån registrert: ${item.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å registrere lånet.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Registrer lån"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Avbryt
          </button>
          <button
            type="submit"
            form="loan-form"
            className="btn btn-primary"
            disabled={busy}
          >
            {busy ? "Registrerer…" : "Registrer lån"}
          </button>
        </>
      }
    >
      <form id="loan-form" onSubmit={submit} className="stack-sm">
        <div className="card card-pad" style={{ boxShadow: "none" }}>
          <div className="cell-main">{item.name}</div>
          <div className="cell-sub">
            {item.serial_number ? (
              <span className="mono">{item.serial_number}</span>
            ) : (
              item.category || "Uten kategori"
            )}
            {item.location ? ` · ${item.location}` : ""}
          </div>
        </div>

        {error ? <Alert>{error}</Alert> : null}

        {item.tracking_type === "quantity" ? (
          <div className="field">
            <label htmlFor="qty">Antall</label>
            <input
              id="qty"
              className="input"
              type="number"
              min={1}
              max={maxQty}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
            />
            <span className="hint">{item.quantity_available} stk er ledig nå.</span>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="due">Leveres tilbake innen</label>
          <input
            id="due"
            className="input"
            type="date"
            value={dueDate}
            min={dateInputValue(0)}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <span className="hint">Valgfritt. La stå tomt om lånet er åpent.</span>
        </div>

        <div className="field">
          <label htmlFor="note">Notat</label>
          <textarea
            id="note"
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="F.eks. hva utstyret skal brukes til"
          />
        </div>
      </form>
    </Modal>
  );
}
