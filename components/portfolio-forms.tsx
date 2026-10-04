"use client";

import { useActionState } from "react";
import { createPortfolioAction, importGithubAction, type PortfolioState } from "@/app/app/portfolio/actions";

function Notice({ state }: { state: PortfolioState }) {
  if (state.error) return <p role="alert" className="text-sm text-danger">{state.error}</p>;
  if (state.info) return <p role="status" className="hl hl-match self-start text-sm">{state.info}</p>;
  return null;
}

export function GithubImportForm() {
  const [state, action, pending] = useActionState<PortfolioState, FormData>(importGithubAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="label">GitHub username or profile link</span>
        <input name="github" required className="field" placeholder="github.com/your-name" maxLength={120} />
      </label>
      <button type="submit" className="btn btn-line self-start" disabled={pending}>{pending ? "Importing" : "Import public repositories"}</button>
      <Notice state={state} />
    </form>
  );
}

export function CreatePortfolioForm({ families }: { families: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<PortfolioState, FormData>(createPortfolioAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="label">Tailor to</span>
        <select name="family" className="field" defaultValue={families[0]?.id}>
          {families.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="email" /> Show my email on the public page
      </label>
      <button type="submit" className="btn btn-pen self-start" disabled={pending}>{pending ? "Building" : "Build portfolio"}</button>
      <Notice state={state} />
    </form>
  );
}
