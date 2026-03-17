import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getSoldierProfile, isSeasonAdmin } from "@/server/db/stores/soldier-store";

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ seasonId: string }>;
}

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps) {
  const { seasonId } = await params;

  const session = await auth();
  if (!session?.user?.id || (!session.user.isApproved && !session.user.isAdmin)) {
    redirect("/");
  }

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) redirect("/");

  const admin = await isSeasonAdmin(seasonId, profile.id);
  if (!admin) redirect(`/season/${seasonId}/board`);

  return <>{children}</>;
}
