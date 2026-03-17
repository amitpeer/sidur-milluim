import { redirect } from "next/navigation";
import {
  getSeasonMembersAction,
  getPendingApprovalUsersAction,
} from "@/server/actions/soldier-actions";
import { fetchIsraelCities } from "@/lib/israel-cities";
import { SoldiersContent } from "./soldiers-content";

interface Props {
  params: Promise<{ seasonId: string }>;
}

export default async function AdminSoldiersPage({ params }: Props) {
  const { seasonId } = await params;

  const [members, pendingUsers, cities] = await Promise.all([
    getSeasonMembersAction(seasonId),
    getPendingApprovalUsersAction(seasonId),
    fetchIsraelCities(),
  ]);

  if (!members) redirect("/");

  return (
    <SoldiersContent
      seasonId={seasonId}
      initialMembers={members}
      initialPendingUsers={pendingUsers}
      cities={cities}
    />
  );
}
