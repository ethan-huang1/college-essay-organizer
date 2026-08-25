import type { Metadata } from "next";

import { AuthCard } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

// Renders under the minimal root layout, so it never touches the database and
// stays reachable even if Postgres is unavailable.
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; email?: string }>;
}) {
  return <AuthCard mode="sign-in" searchParams={await searchParams} />;
}
