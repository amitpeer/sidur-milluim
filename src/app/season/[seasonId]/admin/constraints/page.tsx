import { redirect } from "next/navigation";
import { getAdminConstraintsPageDataAction } from "@/server/actions/constraint-actions";
import { AdminConstraintsContent } from "./constraints-content";

interface Props {
  params: Promise<{ seasonId: string }>;
}

export default async function AdminConstraintsPage({ params }: Props) {
  const { seasonId } = await params;
  const data = await getAdminConstraintsPageDataAction(seasonId);

  if (!data) redirect("/");

  return <AdminConstraintsContent seasonId={seasonId} initialData={data} />;
}
