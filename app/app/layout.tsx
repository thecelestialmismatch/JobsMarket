import { Wordmark } from "@/components/site-header";
import { WorkspaceNav } from "@/components/workspace-nav";
import { signOutAction } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/server/workspace";

export default async function WorkspaceLayout({ children }: LayoutProps<"/app">) {
  const ws = await requireUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
          <Wordmark />
          <div className="flex items-center gap-3 text-sm">
            {ws.mode === "memory" && <span className="label hl hl-unknown">Demo mode</span>}
            <span className="hidden text-ink-2 sm:inline">{ws.user.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="btn btn-quiet text-sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[13rem_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <WorkspaceNav />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
