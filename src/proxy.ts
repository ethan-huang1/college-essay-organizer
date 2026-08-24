import { NextResponse, type NextRequest } from "next/server";

import { BASIC_AUTH_REALM, checkBasicAuth } from "@/lib/basic-auth";

// `middleware.ts` is deprecated in Next.js 16; this is the `proxy.ts`
// convention that replaced it, and it runs on the Node.js runtime by default.
export function proxy(request: NextRequest) {
  const result = checkBasicAuth(request.headers.get("authorization"), {
    user: process.env.BASIC_AUTH_USER,
    password: process.env.BASIC_AUTH_PASSWORD,
    isProduction: process.env.NODE_ENV === "production",
  });

  if (result.ok) return NextResponse.next();

  if (result.reason === "unconfigured") {
    return new NextResponse(
      "This deployment is missing BASIC_AUTH_USER and BASIC_AUTH_PASSWORD, so it is refusing to serve anything.\n",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  return new NextResponse("Authentication required.\n", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${BASIC_AUTH_REALM}", charset="UTF-8"`,
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export const config = {
  // Everything except static assets. Server actions POST to the page routes
  // they were rendered on, so they are covered by this matcher - but note the
  // Next.js guidance that a matcher change can silently drop coverage. If a
  // route handler is ever added under /api it must be added here too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
