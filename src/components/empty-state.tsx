export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-line bg-soft px-4 py-8 text-center text-sm leading-6 text-ink/70">
      {message}
    </div>
  );
}
