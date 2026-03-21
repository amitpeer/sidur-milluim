import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ seasonId: string }>;
}

export default async function AdminManagementPage({ params }: Props) {
  const { seasonId } = await params;
  redirect(`/season/${seasonId}/admin/soldiers`);
}
