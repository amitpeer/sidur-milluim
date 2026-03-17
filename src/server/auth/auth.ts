import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db/client";
import { authConfig } from "./auth.config";

async function getAuthFlags(userId: string) {
  let dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { isApproved: true },
  });

  if (dbUser && !dbUser.isApproved) {
    const approvedUsers = await prisma.user.count({
      where: { isApproved: true },
    });
    if (approvedUsers === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { isApproved: true },
      });
      dbUser = { isApproved: true };
    }
  }

  const adminSeasonMembership = await prisma.seasonMember.findFirst({
    where: {
      role: "admin",
      soldierProfile: {
        userId,
      },
    },
    select: { id: true },
  });

  return {
    isApproved: dbUser?.isApproved ?? false,
    isAdmin: !!adminSeasonMembership,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user?.id) {
        token.sub = user.id;
        const flags = await getAuthFlags(user.id);
        token.isApproved = flags.isApproved;
        token.isAdmin = flags.isAdmin;
      }
      if (trigger === "update" && token.sub) {
        const flags = await getAuthFlags(token.sub);
        token.isApproved = flags.isApproved;
        token.isAdmin = flags.isAdmin;
      }
      if (typeof token.isApproved !== "boolean") {
        token.isApproved = false;
      }
      if (typeof token.isAdmin !== "boolean") {
        token.isAdmin = false;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      if (session.user) session.user.isApproved = token.isApproved === true;
      if (session.user) session.user.isAdmin = token.isAdmin === true;
      return session;
    },
  },
});
