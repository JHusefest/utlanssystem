"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { Stats } from "@/lib/types";

import { useAuth } from "./AuthProvider";

interface NavLink {
  href: string;
  label: string;
  count?: number;
}

const BASE_LINKS: NavLink[] = [
  { href: "/", label: "Utstyr" },
  { href: "/laan", label: "Lån" },
];

export function Header() {
  const { user, isAdmin, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Teller for godkjenningskøen. Hentes på nytt ved hvert sidebytte,
  // slik at tallet stemmer etter at man har behandlet en sak.
  useEffect(() => {
    if (!isAdmin) {
      setQueueCount(0);
      return;
    }
    let cancelled = false;
    api<Stats>("/stats", { auth: false })
      .then((s) => {
        if (!cancelled) setQueueCount(s.pending_requests + s.pending_returns);
      })
      .catch(() => {
        if (!cancelled) setQueueCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, pathname]);

  const links: NavLink[] = [
    ...BASE_LINKS,
    ...(user ? [{ href: "/mine-laan", label: "Mine lån" }] : []),
    ...(isAdmin
      ? [
          { href: "/admin/godkjenning", label: "Godkjenning", count: queueCount },
          { href: "/admin/utstyr", label: "Adm. utstyr" },
          { href: "/admin/brukere", label: "Adm. brukere" },
        ]
      : []),
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const renderLinks = () =>
    links.map((l) => (
      <Link key={l.href} href={l.href} className={isActive(l.href) ? "active" : ""}>
        {l.label}
        {l.count ? <span className="count-pill">{l.count}</span> : null}
      </Link>
    ));

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">U</span>
          <span>Utlån</span>
        </Link>

        <nav className="nav header-desktop">{renderLinks()}</nav>

        <div className="spacer" />

        <div className="header-user header-desktop">
          {user ? (
            <>
              <Link href="/konto" className="nav-user" title="Kontoinnstillinger">
                {user.full_name}
                {isAdmin ? " · admin" : ""}
              </Link>
              <button className="btn btn-sm" onClick={logout}>
                Logg ut
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-sm btn-primary">
              Logg inn
            </Link>
          )}
        </div>

        <button
          className="menu-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-label="Meny"
          aria-expanded={open}
        >
          <span />
        </button>
      </div>

      {open ? (
        <div className="mobile-nav">
          <div className="container">
            <nav className="nav">{renderLinks()}</nav>
            <div className="divider" />
            {user ? (
              <div className="stack-sm">
                <Link href="/konto" className="small muted" style={{ padding: "0 12px" }}>
                  Innlogget som <strong>{user.full_name}</strong>
                  {isAdmin ? " (administrator)" : ""}
                </Link>
                <button className="btn btn-block" onClick={logout}>
                  Logg ut
                </button>
              </div>
            ) : (
              <Link href="/login" className="btn btn-primary btn-block">
                Logg inn
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
