import Link from "next/link";

export function Wordmark() {
  return (
    <Link href="/" className="display-narrow text-xl tracking-tight text-ink" aria-label="JobsMarket home">
      Jobs<span className="hl hl-match">Market</span>
    </Link>
  );
}

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-rule bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75 sticky top-0 z-20">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Wordmark />
        <nav className="flex items-center gap-1 text-sm sm:gap-4" aria-label="Main">
          <Link href="/#how" className="hidden px-2 py-1 text-ink-2 hover:text-ink sm:inline">How it works</Link>
          <Link href="/#pricing" className="hidden px-2 py-1 text-ink-2 hover:text-ink sm:inline">Pricing</Link>
          {signedIn ? (
            <Link href="/app" className="btn btn-pen min-h-9 text-sm">Open workspace</Link>
          ) : (
            <>
              <Link href="/login" className="px-2 py-1 text-ink-2 hover:text-ink">Sign in</Link>
              <Link href="/signup" className="btn btn-line min-h-9 text-sm">Create account</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between">
        <p>JobsMarket drafts. You decide and you apply. Nothing is ever sent to an employer on your behalf.</p>
        <nav className="flex flex-wrap gap-4" aria-label="Footer">
          <Link href="/compare/aiapply-alternative" className="hover:text-ink">JobsMarket vs AIApply</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
