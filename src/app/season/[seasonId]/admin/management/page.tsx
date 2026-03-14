import { redirect } from "next/navigation";
import { getManagementPageDataAction } from "@/server/actions/schedule-actions";
import { getSheetExportsAction } from "@/server/actions/sheets-actions";
import { ManagementContent } from "./management-content";

interface Props {
  params: Promise<{ seasonId: string }>;
}

export default async function AdminManagementPage({ params }: Props) {
  const { seasonId } = await params;

  const [pageData, sheetExports] = await Promise.all([
    getManagementPageDataAction(seasonId),
    getSheetExportsAction(seasonId),
  ]);

  if (!pageData) redirect("/");

  return (
    <ManagementContent
      seasonId={seasonId}
      initialPageData={pageData}
      initialSheetExports={sheetExports}
    />
  );
}
