import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { signUpAction } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { plan } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="display text-4xl">Create your account</h1>
      <p className="text-ink-2">
        Free. Unlocks employers, links, skill gaps and three application kits a month. If you uploaded a CV, it moves across.
      </p>
      <AuthForm mode="signup" action={signUpAction} plan={typeof plan === "string" ? plan : undefined} />
    </div>
  );
}
