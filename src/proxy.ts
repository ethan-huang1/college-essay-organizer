import { NextResponse, type NextRequest } from "next/server";

import { authRequired, isAuthConfigured, SESSION_COOKIE, sessionTokenValid } from "@/lib/auth";

const SIGN_IN_PATH = "/sign-in";

// `middleware.ts` is deprecated in Next.js 16; this is the `proxy.ts`
// convention that replaced it, and it runs on the Node.js runtime by default.
export function proxy(request: NextRequest) {
  const env = {
    username: process.env.AUTH_USERNAME,
    password: process.env.AUTH_PASSWORD,
    secret: process.env.AUTH_SECRET,
    isProduction: process.env.NODE_ENV === "production",
  };

  // Development runs ungated until the variables are set, so `npm run dev`
  // needs no setup.
  if (!authRequired(env)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const onSignInPage = pathname === SIGN_IN_PATH;

  // Fails closed: a production deployment missing its configuration refuses
  // everything rather than serving the essays unprotected. The sign-in page
  // itself still renders, so the reason is visible instead of a bare error.
  if (!isAuthConfigured(env)) {
    if (onSignInPage) return NextResponse.next();
    return NextResponse.redirect(new URL(`${SIGN_IN_PATH}?error=unconfigured`, request.url));
  }

  const signedIn = sessionTokenValid(request.cookies.get(SESSION_COOKIE)?.value, env.secret, Date.now());

  if (signedIn) {
    // Nothing to do on a protected route; bounce an already-signed-in visitor
    // off the sign-in page.
    return onSignInPage ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (onSignInPage) return NextResponse.next();

  const signIn = new URL(SIGN_IN_PATH, request.url);
  signIn.searchParams.set("next", `${pathname}${search}`);
  if (request.cookies.has(SESSION_COOKIE)) signIn.searchParams.set("error", "expired");

  // 303 for a non-GET so an expired Server Action POST becomes a GET of the
  // sign-in page rather than re-posting its body there.
  return request.method === "GET"
    ? NextResponse.redirect(signIn)
    : NextResponse.redirect(signIn, 303);
}

export const config = {
  // Everything except static assets. Server Actions POST to the page routes
  // they were rendered on, so they are covered by this matcher - but note the
  // Next.js guidance that a matcher change can silently drop coverage. If a
  // route handler is ever added under /api it must be added here too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
