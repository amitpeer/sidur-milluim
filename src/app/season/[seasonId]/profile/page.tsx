"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getMyProfileAction,
  updateSoldierProfileAction,
} from "@/server/actions/soldier-actions";
import { fetchIsraelCities } from "@/lib/israel-cities";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { SOLDIER_ROLE_LABELS, type SoldierRole } from "@/lib/constants";

type Profile = NonNullable<Awaited<ReturnType<typeof getMyProfileAction>>>;

export default function ProfilePage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    const data = await getMyProfileAction(seasonId);
    setProfile(data);
    setLoading(false);
  };

  useEffect(() => {
    loadProfile();
    fetchIsraelCities().then(setCities);
  }, [seasonId]);

  const handleCitySave = async (city: string) => {
    if (!profile) return;
    setProfile({ ...profile, city });
    await updateSoldierProfileAction(profile.id, "city", city);
  };

  if (loading) {
    return <div className="p-6 text-zinc-400">טוען...</div>;
  }

  if (!profile) {
    return <div className="p-6 text-zinc-500">פרופיל לא נמצא.</div>;
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <h2 className="mb-6 text-xl font-semibold">פרופיל</h2>

      <div className="flex flex-col gap-4">
        <ProfileField label="שם מלא" value={profile.fullName} />
        <ProfileField label="אימייל" value={profile.email} />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            עיר מגורים
          </span>
          <CityAutocomplete
            value={profile.city ?? ""}
            onChange={handleCitySave}
            cities={cities}
            placeholder="בחרו עיר"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            תפקידים
          </span>
          <div className="flex flex-wrap gap-2">
            {profile.roles.length > 0 ? (
              (profile.roles as SoldierRole[]).map((role) => (
                <span
                  key={role}
                  className="rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800"
                >
                  {SOLDIER_ROLE_LABELS[role]}
                </span>
              ))
            ) : (
              <span className="text-sm text-zinc-400">לא הוגדרו תפקידים</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span className="text-base">{value}</span>
    </div>
  );
}
