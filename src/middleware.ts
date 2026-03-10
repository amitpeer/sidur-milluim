import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    "/((?!api/auth|auth/login|_next/static|_next/image|favicon.ico).*)",
  ],
};
