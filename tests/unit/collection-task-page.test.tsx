import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ customers: vi.fn(), invoices: vi.fn(), tasks: vi.fn(), selected: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  customer: { findMany: mocks.customers }, invoice: { findMany: mocks.invoices },
  collectionTask: { findMany: mocks.tasks, findFirst: mocks.selected, count: mocks.count }
} }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: async () => ({ id: "sales-a", role: "SALES" }) }));
vi.mock("@/lib/actions", () => ({ createCollectionTask: vi.fn(), updateCollectionTask: vi.fn(), recordCustomerOutreach: vi.fn() }));

import { CollectionsPage } from "../../src/app/customer-activity-pages";

const customer = { id: "customer", companyName: "Customer Company", name: "Contact" };
const task = { id: "task", customerId: customer.id, customer, invoiceId: null, invoice: null, status: "Planned", version: 4, scheduledDate: new Date("2026-10-16T00:00:00Z"), notes: "Call customer Friday" };

describe("Collection task page selection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("React", React);
    mocks.customers.mockResolvedValue([customer]);
    mocks.invoices.mockResolvedValue([]);
    mocks.tasks.mockResolvedValue([task]);
    mocks.selected.mockResolvedValue(task);
    mocks.count.mockResolvedValue(1);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps creation as Planned and replaces row management with a task eye link", async () => {
    const html = renderToStaticMarkup(await CollectionsPage({}));
    expect(html).toContain("Add Collection Task");
    expect(html).toContain('href="/collections?tab=ongoing&amp;view=task#collection-task-form"');
    expect(html).toContain('name="status"');
    expect(html).not.toContain("Manage task");
    expect(html).not.toContain("Mark Done");
    expect(html).not.toContain('value="Done"');
    expect(mocks.selected).not.toHaveBeenCalled();
  });

  it("loads a task into the top edit form with status options and its current version", async () => {
    const html = renderToStaticMarkup(await CollectionsPage({ searchParams: Promise.resolve({ view: task.id, cursor: "another-page" }) }));
    expect(html).toContain("Edit Collection Task");
    expect(html).toContain('name="expectedVersion" value="4"');
    expect(html).toContain('value="2026-10-16"');
    expect(html).toContain('value="Call customer Friday"');
    expect(html).toContain('value="Done"');
    expect(html).toContain('value="Cancelled"');
    expect(html).toContain("Save Changes");
    expect(mocks.selected.mock.calls[0][0].where).toMatchObject({ id: task.id, customer: { portfolioOwnerUserId: "sales-a" } });
  });

  it.each(["Done", "Cancelled"])("shows %s task details without an edit submission", async status => {
    mocks.selected.mockResolvedValue({ ...task, status });
    mocks.tasks.mockResolvedValue([{ ...task, status }]);
    const html = renderToStaticMarkup(await CollectionsPage({ searchParams: Promise.resolve({ view: task.id }) }));
    expect(html).toContain("Collection Task Details");
    expect(html).toContain('<fieldset disabled=""');
    expect(html).not.toContain("Save Changes");
    expect(html).not.toContain('name="expectedVersion"');
    expect(mocks.tasks.mock.calls[0][0].where.status.in).toEqual(["Done", "Cancelled"]);
  });

  it("allows an existing task to be edited when no active customers remain", async () => {
    mocks.customers.mockResolvedValue([]);
    const html = renderToStaticMarkup(await CollectionsPage({ searchParams: Promise.resolve({ view: task.id }) }));
    expect(html).toContain("Save Changes");
    expect(html).not.toContain("Add an active customer");
  });

  it("does not reveal a missing or foreign task", async () => {
    mocks.selected.mockResolvedValue(null);
    const html = renderToStaticMarkup(await CollectionsPage({ searchParams: Promise.resolve({ view: "foreign-task" }) }));
    expect(html).toContain("Collection task is unavailable or outside your portfolio.");
    expect(html).not.toContain("Edit Collection Task");
    expect(html).not.toContain('name="taskId"');
  });
});
