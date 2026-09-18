import type { Equipment, Loan, LoanStatus } from "./types";

export type Tone = "ok" | "warn" | "muted" | "bad" | "info";

const dateTime = new Intl.DateTimeFormat("nb-NO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateOnly = new Intl.DateTimeFormat("nb-NO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDateTime(value: string | null): string {
  if (!value) return "–";
  return dateTime.format(new Date(value));
}

export function formatDate(value: string | null): string {
  if (!value) return "–";
  return dateOnly.format(new Date(value));
}

/** «for 3 dager siden» – brukes i godkjenningskøen. */
export function timeAgo(value: string | null): string {
  if (!value) return "–";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "nettopp";
  if (minutes < 60) return `for ${minutes} min siden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `for ${hours} ${hours === 1 ? "time" : "timer"} siden`;
  const days = Math.round(hours / 24);
  if (days < 30) return `for ${days} ${days === 1 ? "dag" : "dager"} siden`;
  return formatDate(value);
}

// ------------------------------------------------------------------ lån

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  pending: "Venter på godkjenning",
  active: "Utlånt",
  return_pending: "Retur til bekreftelse",
  returned: "Levert",
  rejected: "Avslått",
  cancelled: "Trukket",
};

/** Kortere variant til trange tabellceller. */
export const LOAN_STATUS_SHORT: Record<LoanStatus, string> = {
  pending: "Til godkjenning",
  active: "Utlånt",
  return_pending: "Til bekreftelse",
  returned: "Levert",
  rejected: "Avslått",
  cancelled: "Trukket",
};

export const LOAN_STATUS_TONE: Record<LoanStatus, Tone> = {
  pending: "warn",
  active: "info",
  return_pending: "warn",
  returned: "ok",
  rejected: "bad",
  cancelled: "muted",
};

export function isOverdue(loan: Loan): boolean {
  if (!loan.is_out || !loan.due_date) return false;
  return new Date(loan.due_date).getTime() < Date.now();
}

// --------------------------------------------------------------- utstyr

export function statusTone(item: Equipment): Tone {
  if (item.status === "retired") return "muted";
  if (item.status === "maintenance") return "warn";
  if (item.quantity_available > 0) return "ok";
  if (item.quantity_reserved > 0 && item.quantity_on_loan === 0) return "warn";
  return "bad";
}

export function availabilityLabel(item: Equipment): string {
  if (item.status === "retired") return "Utrangert";
  if (item.status === "maintenance") return "Til service";

  if (item.tracking_type === "unique") {
    if (item.quantity_available > 0) return "Ledig";
    if (item.quantity_reserved > 0) return "Reservert";
    return "Utlånt";
  }

  const parts = [`${item.quantity_available} av ${item.units_total} ledig`];
  if (item.quantity_reserved > 0) parts.push(`${item.quantity_reserved} reservert`);
  return parts.join(" · ");
}

/** yyyy-mm-dd for <input type="date">, n dager fram i tid. */
export function dateInputValue(daysFromNow = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
