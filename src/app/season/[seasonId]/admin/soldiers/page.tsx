import { redirect } from "next/navigation";
import {
  getSeasonMembersAction,
  getPendingApprovalUsersAction,
} from "@/server/actions/soldier-actions";
import { getManagementPageDataAction } from "@/server/actions/schedule-actions";
import { getSheetExportsAction } from "@/server/actions/sheets-actions";
import { fetchIsraelCities } from "@/lib/israel-cities";
import { SoldiersContent } from "./soldiers-content";

interface Props {
  params: Promise<{ seasonId: string }>;
}

export default async function AdminSoldiersPage({ params }: Props) {
  const { seasonId } = await params;

  const [members, pendingUsers, cities, managementData, sheetExports] =
    await Promise.all([
      getSeasonMembersAction(seasonId),
      getPendingApprovalUsersAction(seasonId),
      fetchIsraelCities(),
      getManagementPageDataAction(seasonId),
      getSheetExportsAction(seasonId),
    ]);

  if (!members) redirect("/");
  if (!managementData) redirect("/");

  return (
    <SoldiersContent
      seasonId={seasonId}
      initialMembers={members}
      initialPendingUsers={pendingUsers}
      cities={cities}
      initialPageData={managementData}
      initialSheetExports={sheetExports}
    />
  );
}
