"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createSessionToken,
  emailProblem,
  normalizeEmail,
  passwordProblem,
  safeNextPath,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import { getAppDatabase } from "@/lib/db/server";
import { authenticateUser, createUser, deleteUser, EmailAlreadyRegisteredError } from "@/lib/users";
import { ACTIVE_WORKSPACE_COOKIE, requireSignedInUser } from "@/lib/workspace-session";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function startSession(userId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set, so sessions cannot be signed.");
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(userId, secret, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  // A new session always starts in the signer-in's own workspace, never
  // whichever workspace the previous session happened to be viewing.
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
}

// Returns never: redirect() throws, which is what lets callers treat a
// validation failure as terminating.
function back(page: "sign-in" | "sign-up", error: string, next: string, email?: string): never {
  const params = new URLSearchParams({ error, next });
  if (email) params.set("email", email);
  redirect(`/${page}?${params.toString()}`);
}

export async function signUpAction(formData: FormData) {
  const next = safeNextPath(field(formData, "next"));
  const email = normalizeEmail(field(formData, "email"));
  const password = field(formData, "password");

  const problem = emailProblem(email) ?? passwordProblem(password);
  if (problem) back("sign-up", problem, next, email);

  try {
    const user = await createUser(getAppDatabase().db, { email, password });
    await startSession(user.id);
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) back("sign-up", error.message, next, email);
    throw error;
  }

  redirect(next);
}

export async function signInAction(formData: FormData) {
  const next = safeNextPath(field(formData, "next"));
  const email = normalizeEmail(field(formData, "email"));
  const password = field(formData, "password");

  const user = await authenticateUser(getAppDatabase().db, { email, password });
  // One message for both an unknown email and a wrong password: saying which
  // was wrong reveals whether an account exists.
  if (!user) back("sign-in", "That email and password combination isn't right.", next, email);

  await startSession(user.id);
  redirect(next);
}

export async function signOutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
  redirect("/sign-in");
}

/**
 * Deletes the signed-in account and every piece of data it owns.
 *
 * The user is re-derived from the signed session cookie, never from the form:
 * the only account this can delete is the caller's own, and no id crosses the
 * wire to be tampered with.
 *
 * Deliberately not gated by requireWritableWorkspace. Which workspace someone
 * happens to be viewing has no bearing on their right to delete their account,
 * and the shared example workspace belongs to nobody, so it is outside the
 * cascade either way.
 */
export async function deleteAccountAction() {
  const user = await requireSignedInUser();
  await deleteUser(getAppDatabase().db, user.id);
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
  redirect("/sign-in?error=account-deleted");
}
