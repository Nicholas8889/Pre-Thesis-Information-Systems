import { login } from "@/lib/auth-actions";
import { PasswordInput } from "@/components/password-input";

type SearchParams = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const error = getFirst(params.error);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-7 shadow-soft">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-brand text-sm font-bold text-white shadow-sm">
            CT
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-ink">
            CV Tajuk Revenue Cycle Information System
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Local internal workflow demonstration
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <form action={login} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Username
            <input
              name="username"
              required
              autoComplete="username"
              className={`${inputClass} mt-1`}
              placeholder="admin"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
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
