"use client";

import { useActionState } from "react";
import type { TrackerRow } from "@/lib/types";
import { STATUSES, STATUS_LABEL } from "@/lib/tracker";
import { saveTrackerAction, type TrackerState } from "@/app/app/tracker/actions";

export function TrackerRowForm({ row }: { row?: TrackerRow }) {
  const [state, action, pending] = useActionState<TrackerState, FormData>(saveTrackerAction, {});
  const f = (name: keyof TrackerRow, label: string, type = "text", wide = false) => (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="label">{label}</span>
      <input name={name} type={type} defaultValue={(row?.[name] as string | undefined) ?? ""} className="field" />
    </label>
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4">
      {row && <input type="hidden" name="id" value={row.id} />}
      {f("company", "Employer")}
      {f("role", "Role")}
      <label className="flex flex-col gap-1">
        <span className="label">Status</span>
        <select name="status" defaultValue={row?.status ?? "applied"} className="field">
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      {f("appliedAt", "Date applied", "date")}
      {f("followUpAt", "Follow up on", "date")}
      {f("interviewAt", "Interview date", "date")}
      {f("contactName", "Contact")}
      {f("contactEmail", "Contact email", "email")}
      {f("applyUrl", "Posting link", "url", true)}
      {f("offer", "Offer details")}
      {f("notes", "Notes")}
      <div className="flex items-center gap-3 sm:col-span-4">
        <button type="submit" className="btn btn-pen" disabled={pending}>{row ? "Save changes" : "Add application"}</button>
        {state.error && <span role="alert" className="text-sm text-danger">{state.error}</span>}
        {state.ok && <span role="status" className="text-sm text-ink-2">Saved</span>}
      </div>
    </form>
  );
}
