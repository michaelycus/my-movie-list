import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default async function LoginPage({ searchParams }: PageProps<"/auth/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const hasError = params.error === "auth";

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Sign in to CineMood
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Sign in to save friend profiles and run film sessions. Browsing and
        search stay open to everyone, no account needed.
      </p>
      {hasError && (
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-3 text-sm text-neon-amber">
          Something went wrong signing you in. Please try again.
        </p>
      )}
      <GoogleSignInButton next={next} />
    </main>
  );
}
