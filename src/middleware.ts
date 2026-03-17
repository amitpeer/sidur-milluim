import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth?.user;

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|auth/login|privacy|_next/static|_next/image|favicon.ico|manifest.json).*)",
  ],
};
