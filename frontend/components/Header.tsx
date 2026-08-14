"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "./AuthProvider";

const LINKS = [
  { href: "/", label: "Utstyr" },
  { href: "/laan", label: "Lån" },
];

export function Header() {
  const { user, isAdmin, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const links = [
    ...LINKS,
    ...(user ? [{ href: "/mine-laan", label: "Mine lån" }] : []),
    ...(isAdmin
      ? [
          { href: "/admin/utstyr", label: "Adm. utstyr" },
          { href: "/admin/brukere", label: "Adm. brukere" },
        ]
      : []),
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">U</span>
          <span>Utlån</span>
        </Link>

        <nav className="nav header-desktop">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={isActive(l.href) ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>

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
            <nav className="nav">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={isActive(l.href) ? "active" : ""}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
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
