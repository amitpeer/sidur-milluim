"use client";

import { useActionState, useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  addSoldierToSeasonAction,
  getSeasonMembersAction,
  removeSoldierFromSeasonAction,
  toggleFarAwayAction,
  updateSoldierProfileAction,
  setMemberRoleAction,
  type SoldierActionState,
} from "@/server/actions/soldier-actions";
import {
  SOLDIER_ROLES,
  SOLDIER_ROLE_LABELS,
  type SoldierRole,
} from "@/lib/constants";
import { fetchIsraelCities } from "@/lib/israel-cities";
import { CityAutocomplete } from "@/components/city-autocomplete";

const initialState: SoldierActionState = {};

export default function AdminSoldiersPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const [members, setMembers] = useState<
    Awaited<ReturnType<typeof getSeasonMembersAction>>
  >([]);
  const [cities, setCities] = useState<string[]>([]);
  const [newCity, setNewCity] = useState("");

  const loadMembers = async () => {
    const data = await getSeasonMembersAction(seasonId);
    setMembers(data);
  };

  useEffect(() => {
    loadMembers();
    fetchIsraelCities().then(setCities);
  }, [seasonId]);

  const addSoldierBound = addSoldierToSeasonAction.bind(null, seasonId);
  const [state, formAction, isPending] = useActionState(
    addSoldierBound,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      setNewCity("");
      loadMembers();
    }
  }, [state]);

  type Member = (typeof members)[number];

  const updateMember = (
    profileId: string,
    updater: (m: Member) => Member,
  ) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.soldierProfile.id === profileId ? updater(m) : m,
      ),
    );
  };

  const handleRemove = async (soldierProfileId: string) => {
    if (!window.confirm("האם להסיר את החייל מהעונה?")) return;
    setMembers((prev) =>
      prev.filter((m) => m.soldierProfile.id !== soldierProfileId),
    );
    await removeSoldierFromSeasonAction(seasonId, soldierProfileId);
  };

  const handleToggleFarAway = async (profileId: string, current: boolean) => {
    updateMember(profileId, (m) => ({
      ...m,
      soldierProfile: { ...m.soldierProfile, isFarAway: !current },
    }));
    await toggleFarAwayAction(profileId, !current);
  };

  const handleRolesChange = async (profileId: string, roles: string[]) => {
    updateMember(profileId, (m) => ({
      ...m,
      soldierProfile: { ...m.soldierProfile, roles },
    }));
    await updateSoldierProfileAction(profileId, "roles", roles);
  };

  const handleNameSave = async (profileId: string, name: string) => {
    updateMember(profileId, (m) => ({
      ...m,
      soldierProfile: { ...m.soldierProfile, fullName: name },
    }));
    await updateSoldierProfileAction(profileId, "fullName", name);
  };

  const handleCitySave = async (profileId: string, city: string) => {
    updateMember(profileId, (m) => ({
      ...m,
      soldierProfile: { ...m.soldierProfile, city },
    }));
    await updateSoldierProfileAction(profileId, "city", city);
  };

  const handleToggleAdmin = async (soldierProfileId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "soldier" : "admin";
    const msg = newRole === "admin"
      ? "להפוך למנהל?"
      : "להסיר הרשאות מנהל?";
    if (!window.confirm(msg)) return;
    updateMember(soldierProfileId, (m) => ({
      ...m,
      role: newRole,
    }));
    await setMemberRoleAction(seasonId, soldierProfileId, newRole);
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h2 className="mb-6 text-xl font-semibold">ניהול חיילים</h2>

      <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-4 text-base font-medium">הוספת חייל</h3>

        {state.error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {state.error}
          </div>
        )}

        <form action={formAction} className="grid grid-cols-2 gap-4">
          <FormField label="אימייל" name="email" type="email" required />
          <FormField label="שם מלא" name="fullName" required />
          <FormField label="טלפון" name="phone" />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">עיר מגורים</label>
            <CityAutocomplete
              value={newCity}
              onChange={setNewCity}
              cities={cities}
              name="city"
            />
          </div>
          <div className="col-span-2">
            <span className="mb-1.5 block text-sm font-medium">תפקידים</span>
            <div className="flex gap-4">
              {SOLDIER_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="roles" value={role} />
                  {SOLDIER_ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isPending ? "מוסיף..." : "הוסף חייל"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <th className="px-4 py-3 text-right font-medium">שם</th>
              <th className="px-4 py-3 text-right font-medium">אימייל</th>
              <th className="px-4 py-3 text-right font-medium">עיר</th>
              <th className="px-4 py-3 text-right font-medium">תפקידים</th>
              <th className="px-4 py-3 text-right font-medium">מנהל</th>
              <th className="px-4 py-3 text-right font-medium">מרוחק מאוד</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr
                key={m.id}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <InlineEditableText
                      value={m.soldierProfile.fullName}
                      onSave={(name) => handleNameSave(m.soldierProfile.id, name)}
                    />
                    <button
                      onClick={() => handleRemove(m.soldierProfile.id)}
                      className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      title="הסר מהעונה"
                    >
                      ✕
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {m.soldierProfile.user.email}
                </td>
                <td className="px-4 py-3">
                  <CityAutocomplete
                    value={m.soldierProfile.city ?? ""}
                    onChange={(city) => handleCitySave(m.soldierProfile.id, city)}
                    cities={cities}
                    placeholder="—"
                    inputClassName="w-full border-b border-dashed border-zinc-300 bg-transparent px-1 py-1 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-600"
                  />
                </td>
                <td className="px-4 py-3">
                  <RoleMultiSelect
                    current={m.soldierProfile.roles as SoldierRole[]}
                    onChange={(roles) =>
                      handleRolesChange(m.soldierProfile.id, roles)
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleAdmin(m.soldierProfile.id, m.role)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                      m.role === "admin"
                        ? "bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-900 dark:text-violet-200 dark:hover:bg-violet-800"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {m.role === "admin" ? "כן" : "לא"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() =>
                      handleToggleFarAway(
                        m.soldierProfile.id,
                        m.soldierProfile.isFarAway,
                      )
                    }
                    className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                      m.soldierProfile.isFarAway
                        ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {m.soldierProfile.isFarAway ? "כן" : "לא"}
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-zinc-400"
                >
                  אין חיילים עדיין. הוסיפו חיילים למעלה.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleMultiSelect({
  current,
  onChange,
}: {
  current: readonly SoldierRole[];
  onChange: (roles: SoldierRole[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const label = current.length > 0
    ? current.map((r) => SOLDIER_ROLE_LABELS[r]).join(", ")
    : "—";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full cursor-pointer border-b border-dashed border-zinc-300 text-right hover:text-zinc-900 dark:border-zinc-600 dark:hover:text-zinc-100"
      >
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {SOLDIER_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 px-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={current.includes(role)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...current, role]
                    : current.filter((r) => r !== role);
                  onChange(next);
                }}
              />
              {SOLDIER_ROLE_LABELS[role]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineEditableText({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 cursor-pointer border-b border-dashed border-zinc-300 text-right hover:text-zinc-900 dark:border-zinc-600 dark:hover:text-zinc-100"
      >
        {value}
        <svg className="h-3 w-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
    />
  );
}

function FormField({
  label,
  name,
  type = "text",
  placeholder,
  required,
  className = "",
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
      />
    </div>
  );
}
