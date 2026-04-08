import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true,
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  pages: {
    signIn: "/auth/login",
  },
};
