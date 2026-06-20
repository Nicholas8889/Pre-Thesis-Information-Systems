import { createAccount } from "@/lib/auth-actions";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RestrictedAction } from "@/components/restricted-action";
import { roleLabel } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getSearchMessage } from "@/lib/workflow";
import { getCurrentUser } from "@/lib/session";
import { canRole, getRestrictionMessage } from "@/lib/role-access";

type SearchParams = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const { success, error } = getSearchMessage(params);
  const currentUser = await getCurrentUser();
  const canCreateAccount = canRole(currentUser?.role, "CREATE_ACCOUNT");
  const accountRestriction = getRestrictionMessage("CREATE_ACCOUNT");
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      status: true,
      createdAt: true
    }
  });

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage local demo accounts. Roles control dashboard views, reminders, and Manager approval actions while operational pages remain shared."
      />

      <FlashMessage success={success} error={error} />

      <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
        <h2 className="mb-4 text-lg font-semibold">Account Management</h2>
        <form action={createAccount}>
          <fieldset disabled={!canCreateAccount} className="grid gap-4 disabled:cursor-not-allowed disabled:opacity-60 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Username
            <input name="username" required className={`${inputClass} mt-1`} />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Display Name
            <input name="displayName" required className={`${inputClass} mt-1`} />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Password
            <input name="password" type="password" required className={`${inputClass} mt-1`} />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Role
            <select name="role" defaultValue="SALES" className={`${inputClass} mt-1`}>
              <option value="ADMIN">Admin</option>
              <option value="SALES">Sales</option>
              <option value="MANAGER">Manager</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Status
            <select name="status" defaultValue="Active" className={`${inputClass} mt-1`}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>

          <div className="flex items-end">
            {canCreateAccount ? (
              <button className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
                Save Account
              </button>
            ) : (
              <RestrictedAction message={accountRestriction} className="w-full">
                <button disabled className="inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-200 px-4 text-sm font-semibold text-slate-500">
                  Save Account
                </button>
              </RestrictedAction>
            )}
          </div>
          </fieldset>
        </form>
      </section>

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        <h2 className="mb-4 text-lg font-semibold">Existing Accounts</h2>
        {users.length === 0 ? (
          <EmptyState message="No accounts found. Seed the database or add an account." />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Username</th>
                  <th className="py-3 pr-4">Display Name</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {users.map((user) => (
                  <tr key={user.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">{user.username}</td>
                    <td className="py-3 pr-4 text-slate-600">{user.displayName}</td>
                    <td className="py-3 pr-4 text-slate-600">{roleLabel(user.role)}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="py-3 text-slate-600">{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
