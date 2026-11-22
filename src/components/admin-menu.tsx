"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The admin pages, grouped under one "Admin" menu so the top bar fits on one
// line. Closes on navigation, Escape, or a click outside.
const ADMIN_LINKS = [
  { href: "/admin/people", label: "People" },
  { href: "/admin/partners", label: "Partners" },
  { href: "/admin/invoices", label: "Invoices" },
  { href: "/admin/follow-up", label: "Follow-up" },
  { href: "/admin/notifications", label: "Outbox" },
];

export function AdminMenu({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = pathname.startsWith("/admin");
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="admin-menu"
        onClick={() => setOpen((o) => !o)}
        className={`${className} ${active ? "bg-iris-soft" : ""}`}
      >
        Admin <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul id="admin-menu" className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-border bg-surface p-1 shadow-lg">
          {ADMIN_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`block rounded-lg px-3 py-2 hover:bg-iris-soft ${pathname.startsWith(l.href) ? "font-medium text-iris" : ""}`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
