"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The only client-side JavaScript in the app: marking the current section in
// the top navigation. Everything else stays a server component with plain
// forms.
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const section = href.split("?")[0];
  // A section stays current on its own sub-routes, so /plans/<slug> keeps
  // Plans marked. Exact match for "/" or every route would match it.
  const active = section === "/" ? pathname === "/" : pathname === section || pathname.startsWith(`${section}/`);

  return (
    <Link className={className} href={href} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
