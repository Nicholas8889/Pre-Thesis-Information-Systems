import { redirect } from "next/navigation";

export default async function LegacyPickingListPrintPage({
  params,
}: {
  params: Promise<{ pickingListId: string }>;
}) {
  const { pickingListId } = await params;
  redirect(`/pick-pack/${pickingListId}/print`);
}
