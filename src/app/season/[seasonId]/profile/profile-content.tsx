"use client";

import { useState } from "react";
import { updateSoldierProfileAction } from "@/server/actions/soldier-actions";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { SOLDIER_ROLE_LABELS, type SoldierRole } from "@/lib/constants";
import type { getMyProfileAction } from "@/server/actions/soldier-actions";

type Profile = NonNullable<Awaited<ReturnType<typeof getMyProfileAction>>>;

interface Props {
  readonly profile: Profile;
  readonly cities: string[];
}

export function ProfileContent({ profile: initialProfile, cities }: Props) {
  const [profile, setProfile] = useState(initialProfile);

  const handleCitySave = async (city: string) => {
    setProfile({ ...profile, city });
    await updateSoldierProfileAction(profile.id, "city", city);
  };

  return (
    <div className="mx-auto max-w-lg p-6">
      <h2 className="mb-6 text-xl font-semibold">הפרופיל שלי</h2>

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
