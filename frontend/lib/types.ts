export type Role = "admin" | "user";
export type TrackingType = "unique" | "quantity";
export type EquipmentStatus = "available" | "on_loan" | "maintenance" | "retired";

export type LoanStatus =
  | "pending"          // forespurt, venter på godkjenning
  | "active"           // godkjent og utlevert
  | "return_pending"   // retur meldt inn, venter på bekreftelse
  | "returned"         // bekreftet levert
  | "rejected"         // avslått
  | "cancelled";       // trukket av låntakeren

export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  school_class: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface PersonBrief {
  id: number;
  full_name: string;
  school_class: string | null;
}

export interface Equipment {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  location: string | null;
  tracking_type: TrackingType;
  serial_number: string | null;
  asset_tag: string | null;
  status: EquipmentStatus;
  quantity_total: number;
  units_total: number;
  quantity_on_loan: number;
  quantity_reserved: number;
  quantity_available: number;
  is_available: boolean;
  is_usable: boolean;
  created_at: string;
}

export interface Loan {
  id: number;
  status: LoanStatus;
  quantity: number;

  borrowed_at: string;
  due_date: string | null;
  approved_at: string | null;
  return_requested_at: string | null;
  returned_at: string | null;

  note: string | null;
  decision_note: string | null;

  is_open: boolean;
  is_out: boolean;
  needs_admin: boolean;

  equipment: {
    id: number;
    name: string;
    category: string | null;
    serial_number: string | null;
    tracking_type: TrackingType;
  };
  user: PersonBrief;
  approved_by: PersonBrief | null;
  returned_by: PersonBrief | null;
}

export interface Stats {
  equipment_count: number;
  unit_count: number;
  available_units: number;
  active_loans: number;
  overdue_loans: number;
  pending_requests: number;
  pending_returns: number;
  user_count: number;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}
