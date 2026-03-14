import { redirect } from "next/navigation";
import { getMyProfileAction } from "@/server/actions/soldier-actions";
import { fetchIsraelCities } from "@/lib/israel-cities";
import { ProfileContent } from "./profile-content";

interface Props {
  params: Promise<{ seasonId: string }>;
}

export default async function ProfilePage({ params }: Props) {
  const { seasonId } = await params;

  const [profile, cities] = await Promise.all([
    getMyProfileAction(seasonId),
    fetchIsraelCities(),
  ]);

  if (!profile) redirect("/");

  return <ProfileContent profile={profile} cities={cities} />;
}
