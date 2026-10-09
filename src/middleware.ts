import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { decideAccess } from "@/lib/rbac";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const decision = decideAccess(req.nextUrl.pathname, req.auth?.user?.role ?? null);

  if (decision.type === "redirect") {
    return NextResponse.redirect(new URL(decision.to, req.nextUrl.origin));
  }
  if (decision.type === "deny") {
    return NextResponse.json(
      { error: decision.status === 401 ? "unauthenticated" : "forbidden" },
      { status: decision.status },
    );
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
