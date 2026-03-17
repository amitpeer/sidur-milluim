import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { PendingContent } from "./pending-content";

export default async function PendingApprovalPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/login");
  }
  if (session.user.isApproved || session.user.isAdmin) {
    redirect("/");
  }
  return <PendingContent />;
}
