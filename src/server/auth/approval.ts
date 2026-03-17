import { auth } from "@/server/auth/auth";

export async function getApprovedSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  if (!session.user.isApproved && !session.user.isAdmin) {
    return null;
  }
  return session;
}
