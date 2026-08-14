import type { Equipment, EquipmentStatus, Loan } from "./types";

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

export const STATUS_LABEL: Record<EquipmentStatus, string> = {
  available: "Ledig",
  on_loan: "Utlånt",
  maintenance: "Til service",
  retired: "Utrangert",
};

export function statusTone(item: Equipment): "ok" | "warn" | "muted" | "bad" {
  if (item.status === "retired") return "muted";
  if (item.status === "maintenance") return "warn";
  if (item.quantity_available > 0) return "ok";
  return "bad";
}

export function availabilityLabel(item: Equipment): string {
  if (item.status === "retired") return "Utrangert";
  if (item.status === "maintenance") return "Til service";
  if (item.tracking_type === "unique") {
    return item.quantity_available > 0 ? "Ledig" : "Utlånt";
  }
  return `${item.quantity_available} av ${item.quantity_total} ledig`;
}

export function isOverdue(loan: Loan): boolean {
  if (loan.returned_at || !loan.due_date) return false;
  return new Date(loan.due_date).getTime() < Date.now();
}

/** yyyy-mm-dd for <input type="date">, n dager fram i tid. */
export function dateInputValue(daysFromNow = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
