"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

// The only client-side JavaScript in the app: marking the current section (and
// the currently focused school) in the sidebar. Everything else stays a server
// component with plain forms.
export function NavLink({
  href,
  schoolId,
  className,
  children,
}: {
  href: string;
  schoolId?: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const focusedSchool = useSearchParams().get("school");
  const section = href.split("?")[0];
  const active = schoolId ? pathname === section && focusedSchool === schoolId : pathname === section;

  return (
    <Link className={className} href={href} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
