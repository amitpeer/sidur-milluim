"use client";

import { useActionState, useEffect, useState, useRef } from "react";
import {
  addSoldierToSeasonAction,
  getSeasonMembersAction,
  getPendingApprovalUsersAction,
  getNonMemberSoldiersAction,
  addExistingSoldierToSeasonAction,
  removeExistingSoldierFromSeasonAction,
  approveUserAction,
  deleteUserAction,
  removeSoldierFromSeasonAction,
  toggleFarAwayAction,
  updateSoldierProfileAction,
  setMemberRoleAction,
  type SoldierActionState,
  type NonMemberSoldier,
} from "@/server/actions/soldier-actions";
import {
  SOLDIER_ROLES,
  SOLDIER_ROLE_LABELS,
  type SoldierRole,
} from "@/lib/constants";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { AdminConstraintsContent } from "../constraints/constraints-content";
import { StatsTable } from "@/components/stats-table";
import {
  getSoldierStatsAction,
  getManagementPageDataAction,
  type SoldierStats,
} from "@/server/actions/schedule-actions";
import { getSheetExportsAction } from "@/server/actions/sheets-actions";
import { ManagementContent } from "../management/management-content";

type Tab = "chayyalim" | "iluzim" | "statistikot" | "nihul";

const TABS: readonly { readonly key: Tab; readonly label: string }[] = [
  { key: "chayyalim", label: "חיילים" },
  { key: "iluzim", label: "אילוצים" },
  { key: "statistikot", label: "סטטיסטיקות" },
  { key: "nihul", label: "סידור" },
];

const initialState: SoldierActionState = {};

type Members = Awaited<ReturnType<typeof getSeasonMembersAction>>;
type PendingUsers = Awaited<ReturnType<typeof getPendingApprovalUsersAction>>;
type ManagementPageData = NonNullable<
  Awaited<ReturnType<typeof getManagementPageDataAction>>
>;
type SheetExportRow = Awaited<ReturnType<typeof getSheetExportsAction>>[number];

interface Props {
  readonly seasonId: string;
  readonly initialMembers: Members;
  readonly initialPendingUsers: PendingUsers;
  readonly initialNonMembers: NonMemberSoldier[];
  readonly cities: string[];
  readonly initialPageData: ManagementPageData;
  readonly initialSheetExports: SheetExportRow[];
}

export function SoldiersContent({
  seasonId,
  initialMembers,
  initialPendingUsers,
  initialNonMembers,
  cities,
  initialPageData,
  initialSheetExports,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("chayyalim");
  const [members, setMembers] = useState(initialMembers);
  const [pendingUsers, setPendingUsers] = useState(initialPendingUsers);
  const [nonMembers, setNonMembers] = useState(initialNonMembers);
  const [addingNonMember, setAddingNonMember] = useState<Record<string, boolean>>({});
  const [pendingApprovals, setPendingApprovals] = useState<Record<string, boolean>>({});
  const [approvalMessage, setApprovalMessage] = useState("");
  const [newCity, setNewCity] = useState("");
  const [stats, setStats] = useState<SoldierStats[]>([]);
  const [statsVersionDate, setStatsVersionDate] = useState<Date | null>(null);
  const [statsSheetVersion, setStatsSheetVersion] = useState<number | null>(null);
  const [statsLastSynced, setStatsLastSynced] = useState<Date | null>(null);
  const [statsLoaded, setStatsLoaded] = useState(false);

  const loadMembers = async () => {
    const data = await getSeasonMembersAction(seasonId);
    setMembers(data);
  };

  const loadPendingUsers = async () => {
    const data = await getPendingApprovalUsersAction(seasonId);
    setPendingUsers(data);
  };

  const loadNonMembers = async () => {
    const data = await getNonMemberSoldiersAction(seasonId);
    setNonMembers(data);
  };

  const handleAddExistingSoldier = async (profileId: string) => {
    setAddingNonMember((prev) => ({ ...prev, [profileId]: true }));
    const result = await addExistingSoldierToSeasonAction(seasonId, profileId);
    setAddingNonMember((prev) => ({ ...prev, [profileId]: false }));

    if (result.error) return;

    await Promise.all([loadMembers(), loadNonMembers()]);
  };

  const handleRemoveFromOtherSeason = async (
    targetSeasonId: string,
    profileId: string,
    seasonName: string,
  ) => {
    if (!window.confirm(`להסיר את החייל מהעונה "${seasonName}"?`)) return;

    setNonMembers((prev) =>
      prev
        .map((s) =>
          s.profileId === profileId
            ? { ...s, seasons: s.seasons.filter((sn) => sn.seasonId !== targetSeasonId) }
            : s,
        )
        .filter((s) => s.seasons.length > 0),
    );

    const result = await removeExistingSoldierFromSeasonAction(seasonId, targetSeasonId, profileId);
    if (result.error) await loadNonMembers();
  };

  useEffect(() => {
    if (activeTab === "statistikot" && !statsLoaded) {
      getSoldierStatsAction(seasonId).then((result) => {
        setStats(result.stats);
        setStatsVersionDate(result.versionDate);
        setStatsSheetVersion(result.sheetVersionNumber);
        setStatsLastSynced(result.lastSyncedAt);
        setStatsLoaded(true);
      });
    }
  }, [activeTab, seasonId, statsLoaded]);

  const addSoldierBound = addSoldierToSeasonAction.bind(null, seasonId);
  const [state, formAction, isPending] = useActionState(
    async (prevState: SoldierActionState, formData: FormData) => {
      const result = await addSoldierBound(prevState, formData);
      if (result.success) {
        setNewCity("");
        await loadMembers();
      }
      return result;
    },
    initialState,
  );

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

  const handleApproveUser = async (userId: string) => {
    setPendingApprovals((prev) => ({ ...prev, [userId]: true }));
    setApprovalMessage("");
    const result = await approveUserAction(seasonId, userId);
    setPendingApprovals((prev) => ({ ...prev, [userId]: false }));

    if (result.error) {
      setApprovalMessage(result.error);
      return;
    }

    setApprovalMessage("המשתמש אושר בהצלחה.");

    await Promise.all([loadPendingUsers(), loadMembers()]);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("למחוק את המשתמש לצמיתות?")) return;
    setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
    await deleteUserAction(seasonId, userId);
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "iluzim" && (
        <AdminConstraintsContent seasonId={seasonId} />
      )}

      {activeTab === "statistikot" && (
        stats.length > 0
          ? <StatsTable stats={stats} versionDate={statsVersionDate} sheetVersionNumber={statsSheetVersion} lastSyncedAt={statsLastSynced} />
          : <div className="text-sm text-zinc-400">{statsLoaded ? "אין נתונים עדיין." : "טוען..."}</div>
      )}

      {activeTab === "nihul" && (
        <ManagementContent
          seasonId={seasonId}
          initialPageData={initialPageData}
          initialSheetExports={initialSheetExports}
          asTab
          onScheduleChange={() => setStatsLoaded(false)}
        />
      )}

      {activeTab === "chayyalim" && (
        <>
      <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-4 text-base font-medium">משתמשים ממתינים לאישור</h3>
        {approvalMessage && (
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">{approvalMessage}</p>
        )}
        {pendingUsers.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">אין משתמשים ממתינים.</p>
        ) : (
          <div className="space-y-2">
            {pendingUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user.name ?? "ללא שם"}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{user.email}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveUser(user.id)}
                    disabled={pendingApprovals[user.id] === true}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {pendingApprovals[user.id] ? "מאשר..." : "אשר"}
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
                  >
                    מחק
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {nonMembers.length > 0 && (
        <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="mb-4 text-base font-medium">חיילים מעונות אחרות</h3>
          <div className="space-y-2">
            {nonMembers.map((soldier) => (
              <div
                key={soldier.profileId}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{soldier.fullName}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {[
                      soldier.city,
                      soldier.roles.length > 0
                        ? soldier.roles
                            .map((r) => SOLDIER_ROLE_LABELS[r as SoldierRole] ?? r)
                            .join(", ")
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                  {soldier.seasons.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {soldier.seasons.map((sn) => (
                        <span
                          key={sn.seasonId}
                          className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        >
                          {sn.seasonName}
                          <button
                            onClick={() => handleRemoveFromOtherSeason(sn.seasonId, soldier.profileId, sn.seasonName)}
                            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            title={`הסר מ-${sn.seasonName}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleAddExistingSoldier(soldier.profileId)}
                  disabled={addingNonMember[soldier.profileId] === true}
                  className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {addingNonMember[soldier.profileId] ? "מוסיף..." : "הוסף לעונה"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
              <th className="px-3 py-2 text-right font-medium">שם</th>
              <th className="px-3 py-2 text-right font-medium">תפקידים</th>
              <th className="px-3 py-2 text-right font-medium">סטטוס</th>
              <th className="min-w-[140px] px-3 py-2 text-right font-medium">עיר</th>
              <th className="w-12 px-2 py-2 text-center font-medium">מרוחק</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr
                key={m.id}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="px-3 py-2">
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
                <td className="px-3 py-2">
                  <RoleMultiSelect
                    current={m.soldierProfile.roles as SoldierRole[]}
                    onChange={(roles) =>
                      handleRolesChange(m.soldierProfile.id, roles)
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => handleToggleAdmin(m.soldierProfile.id, m.role)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                      m.role === "admin"
                        ? "bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-900 dark:text-violet-200 dark:hover:bg-violet-800"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {m.role === "admin" ? "מנהל" : "חייל"}
                  </button>
                </td>
                <td className="min-w-[140px] px-3 py-2">
                  <CityAutocomplete
                    value={m.soldierProfile.city ?? ""}
                    onChange={(city) => handleCitySave(m.soldierProfile.id, city)}
                    cities={cities}
                    placeholder="—"
                    inputClassName="w-full border-b border-dashed border-zinc-300 bg-transparent px-1 py-1 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-600"
                  />
                </td>
                <td className="w-12 px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={m.soldierProfile.isFarAway}
                    onChange={() =>
                      handleToggleFarAway(
                        m.soldierProfile.id,
                        m.soldierProfile.isFarAway,
                      )
                    }
                    className="h-4 w-4 cursor-pointer accent-amber-500"
                  />
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-zinc-400"
                >
                  אין חיילים עדיין. הוסיפו חיילים למעלה.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
        </>
      )}
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
