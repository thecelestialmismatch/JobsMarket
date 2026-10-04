import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { signInAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="display text-4xl">Sign in</h1>
      {error === "confirm" && (
        <p role="alert" className="text-sm text-danger">That confirmation link has expired. Sign in to get a new one.</p>
      )}
      <AuthForm mode="signin" action={signInAction} next={typeof next === "string" ? next : undefined} />
    </div>
  );
}
