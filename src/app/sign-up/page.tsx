import type { Metadata } from "next";

import { AuthCard } from "../auth-form";

export const metadata: Metadata = { title: "Create an account" };

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; email?: string }>;
}) {
  return <AuthCard mode="sign-up" searchParams={await searchParams} />;
}
