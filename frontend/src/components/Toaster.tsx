import { useToasts } from "@/store/toast";
import { cx } from "@/lib/format";
import { CloseIcon } from "./Icons";

const TONE = {
  info: "border-ink-500 text-chalk",
  success: "border-amber/60 text-amber",
  error: "border-red-500/60 text-red-300",
} as const;

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,26rem)]
                 -translate-x-1/2 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            "pointer-events-auto flex animate-fade-up items-center gap-3 rounded-xl border",
            "bg-ink-700/95 px-4 py-3 text-sm shadow-card backdrop-blur-xl",
            TONE[toast.tone],
          )}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
            className="text-muted transition-colors hover:text-chalk"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
