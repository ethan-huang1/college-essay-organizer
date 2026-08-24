"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createSessionToken,
  credentialsValid,
  isAuthConfigured,
  safeNextPath,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

function authEnv() {
  return {
    username: process.env.AUTH_USERNAME,
    password: process.env.AUTH_PASSWORD,
    secret: process.env.AUTH_SECRET,
    isProduction: process.env.NODE_ENV === "production",
  };
}

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signInAction(formData: FormData) {
  const env = authEnv();
  const next = safeNextPath(field(formData, "next"));

  if (!isAuthConfigured(env) || !env.secret) {
    redirect(`/sign-in?error=unconfigured&next=${encodeURIComponent(next)}`);
  }

  if (!credentialsValid(env, field(formData, "username"), field(formData, "password"))) {
    // The same message for a wrong username as for a wrong password: saying
    // which one was wrong tells an attacker that a username exists.
    redirect(`/sign-in?error=invalid&next=${encodeURIComponent(next)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(env.secret, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect(next);
}

export async function signOutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/sign-in");
}
