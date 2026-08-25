import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, sessionUserId } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/sign-in", "/sign-up"]);

// `middleware.ts` is deprecated in Next.js 16; this is the `proxy.ts`
// convention that replaced it, and it runs on the Node.js runtime by default.
//
// Only the cookie's signature and expiry are checked here - no database read -
// so the gate stays cheap. Whether the account still exists is settled later by
// getSignedInUser.
export function proxy(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);

  // Fails closed: without a signing secret no session can be verified, so the
  // app refuses rather than serving anyone's essays. The sign-in page still
  // renders so the reason is visible instead of a bare error.
  if (!secret) {
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/sign-in?error=unconfigured", request.url));
  }

  const signedIn = Boolean(sessionUserId(request.cookies.get(SESSION_COOKIE)?.value, secret, Date.now()));

  if (signedIn) {
    // Bounce an already-signed-in visitor off the sign-in and sign-up pages.
    return isPublic ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (isPublic) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
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
