import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { getSignedInUser } from "@/lib/workspace-session";
import { AuthCard } from "../auth-form";

export const metadata: Metadata = { title: "Create an account" };

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; email?: string }>;
}) {
  // Only this page can tell an ordinary signed-in visitor (send them home) from
  // a stale cookie whose account is gone (let them sign in again).
  if (await getSignedInUser()) redirect("/");
  return <AuthCard mode="sign-up" searchParams={await searchParams} />;
}
