"use client";

import { useActionState } from "react";
import {
  createSeasonAction,
  type CreateSeasonState,
} from "@/server/actions/season-actions";

const initialState: CreateSeasonState = {};

export default function NewSeasonPage() {
  const [state, formAction, isPending] = useActionState(
    createSeasonAction,
    initialState,
  );

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold">יצירת עונה חדשה</h1>

      {state.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {state.error}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-5">
        <Field
          label="שם העונה"
          name="name"
          placeholder='למשל: "מילואים מרץ 2026"'
          required
          errors={state.fieldErrors?.name}
        />
        <Field
          label="תאריך התחלה"
          name="startDate"
          type="date"
          required
          errors={state.fieldErrors?.startDate}
        />
        <Field
          label="תאריך סיום"
          name="endDate"
          type="date"
          required
          errors={state.fieldErrors?.endDate}
        />
        <Field
          label='סיום אל"ת'
          name="trainingEndDate"
          type="date"
          errors={state.fieldErrors?.trainingEndDate}
        />
        <div className="flex flex-col gap-1.5">
          <Field
            label="כמה חיילים ביום"
            name="dailyHeadcount"
            type="number"
            defaultValue="8"
            min="1"
            inputMode="numeric"
            errors={state.fieldErrors?.dailyHeadcount}
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            ניתן לשנות בהגדרות העונה
          </p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending ? "יוצר..." : "צור עונה"}
        </button>
      </form>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  defaultValue,
  errors,
  min,
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  errors?: string[];
  min?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        lang={type === "date" ? "he-IL" : undefined}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        min={min}
        inputMode={inputMode}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
      />
      {errors?.map((err) => (
        <p key={err} className="text-xs text-red-600 dark:text-red-400">
          {err}
        </p>
      ))}
    </div>
  );
}
