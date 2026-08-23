import Image from "next/image";
import { login } from "@/lib/auth-actions";
import { PasswordInput } from "@/components/password-input";

type SearchParams = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const error = getFirst(params.error);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-md border border-line bg-white p-7 shadow-card">
        <div className="mb-6 text-center">
          <Image
            src="/tajuk-logo.png"
            alt="TAJUK"
            width={612}
            height={407}
            className="mx-auto mb-4 h-auto w-40"
            priority
          />
          <h1 className="text-2xl font-semibold tracking-normal text-ink">
            CV Tajuk Revenue Cycle Information System
          </h1>
          <p className="mt-2 text-sm text-ink/80">
            Internal Revenue Cycle Information Systems
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        <form action={login} className="space-y-4">
          <label className="block text-sm font-medium text-ink">
            Username
            <input
              name="username"
              required
              autoComplete="username"
              className={`${inputClass} mt-1`}
              placeholder="Enter username"
            />
          </label>

          <label className="block text-sm font-medium text-ink">
            Password
            <PasswordInput className={inputClass} />
          </label>

          <button className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/95">
            Login
          </button>
        </form>
      </section>
    </main>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
