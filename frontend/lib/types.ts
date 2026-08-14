export type Role = "admin" | "user";
export type TrackingType = "unique" | "quantity";
export type EquipmentStatus = "available" | "on_loan" | "maintenance" | "retired";

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
  quantity_on_loan: number;
  quantity_available: number;
  is_available: boolean;
  created_at: string;
}

export interface Loan {
  id: number;
  quantity: number;
  borrowed_at: string;
  due_date: string | null;
  returned_at: string | null;
  note: string | null;
  is_active: boolean;
  equipment: {
    id: number;
    name: string;
    category: string | null;
    serial_number: string | null;
    tracking_type: TrackingType;
  };
  user: {
    id: number;
    full_name: string;
    school_class: string | null;
  };
}

export interface Stats {
  equipment_count: number;
  unit_count: number;
  available_units: number;
  active_loans: number;
  overdue_loans: number;
  user_count: number;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}
