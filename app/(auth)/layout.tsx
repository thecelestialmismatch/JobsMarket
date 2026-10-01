import { SiteFooter, Wordmark } from "@/components/site-header";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center px-4"><Wordmark /></header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12">{children}</main>
      <SiteFooter />
    </>
  );
}
