export function DocumentRevisionBadge({ revisionNumber }: { revisionNumber?: number }) {
  if (!revisionNumber || revisionNumber <= 1) return null;
  return <span className="inline-flex rounded-md border border-line bg-soft px-2 py-1 text-xs font-semibold text-ink" title="Revisi dokumen saat ini">Revisi {revisionNumber}</span>;
}
