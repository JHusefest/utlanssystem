"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { LoanDialog } from "@/components/LoanDialog";
import { Badge, Empty, Loading, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import { availabilityLabel, statusTone } from "@/lib/format";
import type { Equipment, Stats } from "@/lib/types";

export default function HomePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [loanItem, setLoanItem] = useState<Equipment | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [eq, st, cats] = await Promise.all([
        api<Equipment[]>("/equipment", { auth: false }),
        api<Stats>("/stats", { auth: false }),
        api<string[]>("/equipment/categories", { auth: false }),
      ]);
      setItems(eq);
      setStats(st);
      setCategories(cats);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klarte ikke å hente data.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category && i.category !== category) return false;
      if (availableOnly && !i.is_available) return false;
      if (!needle) return true;
      return [i.name, i.category, i.serial_number, i.asset_tag, i.location, i.description]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle));
    });
  }, [items, search, category, availableOnly]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Utstyr</h1>
          <p className="sub">
            Oversikt over alt IT-utstyr på rommet.
            {user ? "" : " Logg inn for å registrere lån."}
          </p>
        </div>
      </div>

      <div className="stack">
        {stats ? (
          <div className="stats">
            <div className="stat">
              <div className="label">Enheter</div>
              <div className="value">{stats.unit_count}</div>
            </div>
            <div className="stat">
              <div className="label">Ledig nå</div>
              <div className="value">{stats.available_units}</div>
            </div>
            <div className="stat">
              <div className="label">Aktive lån</div>
              <div className="value">{stats.active_loans}</div>
            </div>
            <div className="stat">
              <div className="label">På overtid</div>
              <div className={`value${stats.overdue_loans ? " warn" : ""}`}>
                {stats.overdue_loans}
              </div>
            </div>
          </div>
        ) : null}

        <div className="toolbar">
          <input
            className="input search"
            placeholder="Søk etter navn, serienummer, plassering…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Søk"
          />
          <select
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Kategori"
          >
            <option value="">Alle kategorier</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
            />
            Bare ledig
          </label>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        {items === null ? (
          <div className="card">
            <Loading rows={4} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <Empty title="Ingen treff">
              {items.length === 0
                ? "Det er ikke registrert noe utstyr ennå."
                : "Prøv et annet søk eller nullstill filtrene."}
            </Empty>
          </div>
        ) : (
          <div className="equipment-grid">
            {filtered.map((item) => (
              <article key={item.id} className="eq-card">
                <div>
                  <Link href={`/utstyr/${item.id}`} className="title">
                    {item.name}
                  </Link>
                  <div className="meta">
                    {item.category || "Uten kategori"}
                    {item.location ? ` · ${item.location}` : ""}
                  </div>
                  {item.serial_number ? (
                    <div className="meta mono">{item.serial_number}</div>
                  ) : null}
                </div>

                <div className="foot">
                  <Badge tone={statusTone(item)}>{availabilityLabel(item)}</Badge>
                  {user && item.is_available ? (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => setLoanItem(item)}
                    >
                      Lån
                    </button>
                  ) : (
                    <Link href={`/utstyr/${item.id}`} className="btn btn-sm btn-ghost">
                      Detaljer
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {loanItem ? (
        <LoanDialog
          item={loanItem}
          onClose={() => setLoanItem(null)}
          onDone={(message) => {
            setLoanItem(null);
            setToast(message);
            void load();
          }}
        />
      ) : null}

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
