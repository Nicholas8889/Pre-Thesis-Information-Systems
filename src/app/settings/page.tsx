import {
  createAccount,
  resetAccountPassword,
  updateAccountRole,
  updateAccountStatus
} from "@/lib/auth-actions";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatusStack } from "@/components/status-stack";
import { RestrictedAction } from "@/components/restricted-action";
import { roleLabel } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getSearchMessage } from "@/lib/workflow";
import { requireCurrentUser } from "@/lib/session";
import { canRole, getRestrictionMessage } from "@/lib/role-access";
import { MAX_ACTION_NOTE_LENGTH } from "@/lib/action-notes";
import { ServerPagination } from "@/components/server-pagination";
import {
  getCursorArgs,
  getCursorPage,
  getCursorPagination
} from "@/lib/pagination";
import { redirect } from "next/navigation";

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
  const currentUser = await requireCurrentUser();
  if (currentUser.role !== "ADMIN") redirect("/");
  const canCreateAccount = canRole(currentUser?.role, "CREATE_ACCOUNT");
  const accountRestriction = getRestrictionMessage("CREATE_ACCOUNT");
  const pagination = getCursorPagination(params);
  const userRecords = await prisma.user.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    ...getCursorArgs(pagination),
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true
    }
  });
  const userPage = getCursorPage(userRecords, pagination);
  const users = userPage.items;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage local accounts. Only Admin can create accounts or change role, status, and password. Sensitive changes revoke existing sessions."
      />

      <FlashMessage success={success} error={error} />

      <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
        <h2 className="mb-4 text-lg font-semibold">Account Management</h2>
        <form action={createAccount}>
          <fieldset disabled={!canCreateAccount} className="grid gap-4 disabled:cursor-not-allowed disabled:opacity-60 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium text-ink">
            Username
            <input name="username" required className={`${inputClass} mt-1`} />
          </label>

          <label className="text-sm font-medium text-ink">
            Display Name
            <input name="displayName" required className={`${inputClass} mt-1`} />
          </label>

          <label className="text-sm font-medium text-ink">
            Password
            <input name="password" type="password" required className={`${inputClass} mt-1`} />
          </label>

          <label className="text-sm font-medium text-ink">
            Role
            <select name="role" defaultValue="SALES" className={`${inputClass} mt-1`}>
              <option value="ADMIN">Admin</option>
              <option value="SALES">Sales</option>
              <option value="MANAGER">Manager</option>
            </select>
          </label>

          <label className="text-sm font-medium text-ink">
            Status
            <select name="status" defaultValue="Active" className={`${inputClass} mt-1`}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>

          <label className="text-sm font-medium text-ink md:col-span-2">
            Creation Note (optional)
            <input
              name="confirmationNote"
              maxLength={MAX_ACTION_NOTE_LENGTH}
              className={`${inputClass} mt-1`}
              placeholder="Optional context for the audit trail"
            />
          </label>

          <div className="flex items-end">
            {canCreateAccount ? (
              <button className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
                Save Account
              </button>
            ) : (
              <RestrictedAction message={accountRestriction} className="w-full">
                <button disabled className="inline-flex h-10 w-full items-center justify-center rounded-md bg-ink/15 px-4 text-sm font-semibold text-ink/70">
                  Save Account
                </button>
              </RestrictedAction>
            )}
          </div>
          </fieldset>
        </form>
      </section>

      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        <h2 className="mb-4 text-lg font-semibold">Existing Accounts</h2>
        {users.length === 0 ? (
          <EmptyState message="No accounts found. Seed the database or add an account." />
        ) : (
          <div className="overflow-x-auto">
            <table data-server-paginated="true">
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Username</th>
                  <th className="py-3 pr-4">Display Name</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Created</th>
                  <th className="py-3">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {users.map((user) => (
                  <tr key={user.id} className="transition hover:bg-soft">
                    <td className="py-3 pr-4 font-medium">{user.username}</td>
                    <td className="py-3 pr-4 text-ink/80">{user.displayName}</td>
                    <td className="py-3 pr-4 text-ink/80">{roleLabel(user.role)}</td>
                    <td className="py-3 pr-4">
                      <StatusStack>
                        <StatusBadge status={user.status} />
                      </StatusStack>
                    </td>
                    <td className="py-3 pr-4 text-ink/80">{formatDate(user.createdAt)}</td>
                    <td className="min-w-72 py-3">
                      {canCreateAccount ? (
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold text-brand">
                            Manage
                          </summary>
                          <div className="mt-3 space-y-3 rounded-md border border-line bg-soft p-3">
                            <form action={updateAccountStatus} className="grid gap-2">
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="expectedUpdatedAt" value={user.updatedAt.toISOString()} />
                              <select name="status" defaultValue={user.status} className={inputClass}>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                              </select>
                              <input
                                name="confirmationNote"
                                required
                                maxLength={MAX_ACTION_NOTE_LENGTH}
                                className={inputClass}
                                placeholder="Required reason"
                              />
                              <button className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white">
                                Update Status
                              </button>
                            </form>

                            <form action={updateAccountRole} className="grid gap-2 border-t border-line pt-3">
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="expectedUpdatedAt" value={user.updatedAt.toISOString()} />
                              <select name="role" defaultValue={user.role} className={inputClass}>
                                <option value="ADMIN">Admin</option>
                                <option value="SALES">Sales</option>
                                <option value="MANAGER">Manager</option>
                              </select>
                              <input
                                name="confirmationNote"
                                required
                                maxLength={MAX_ACTION_NOTE_LENGTH}
                                className={inputClass}
                                placeholder="Required reason"
                              />
                              <button className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white">
                                Update Role
                              </button>
                            </form>

                            <form action={resetAccountPassword} className="grid gap-2 border-t border-line pt-3">
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="expectedUpdatedAt" value={user.updatedAt.toISOString()} />
                              <input
                                name="password"
                                type="password"
                                required
                                minLength={8}
                                maxLength={128}
                                autoComplete="new-password"
                                className={inputClass}
                                placeholder="New password"
                              />
                              <input
                                name="confirmationNote"
                                required
                                maxLength={MAX_ACTION_NOTE_LENGTH}
                                className={inputClass}
                                placeholder="Required reason"
                              />
                              <button className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white">
                                Reset Password
                              </button>
                            </form>
                          </div>
                        </details>
                      ) : (
                        <span className="text-xs text-ink/60">Admin only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ServerPagination
          hasNext={userPage.hasNext}
          label="accounts"
          nextCursor={userPage.nextCursor}
          pathname="/settings"
          searchParams={params}
          state={pagination}
        />
      </section>
    </>
  );
}
