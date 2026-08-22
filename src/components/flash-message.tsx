export function FlashMessage({
  success,
  error
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) {
    return null;
  }

  return (
    <div
      className={`mb-5 rounded-md border px-4 py-3 text-sm font-medium ${
        error
          ? "border-transparent bg-danger text-white"
          : "border-transparent bg-success text-white"
      }`}
    >
      {error || success}
    </div>
  );
}
