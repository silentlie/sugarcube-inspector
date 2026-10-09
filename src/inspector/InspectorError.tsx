interface InspectorErrorProps {
  error: Error;
  onRetry: () => void;
}

export default function InspectorError({
  error,
  onRetry,
}: InspectorErrorProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-red-400">Inspector Error</h2>

      <pre className="text-xs wrap-break-word whitespace-pre-wrap text-red-300">
        {error.message}
      </pre>

      <button
        type="button"
        onClick={onRetry}
        className="rounded bg-zinc-800 px-3 py-1 text-sm"
      >
        Retry
      </button>
    </div>
  );
}
