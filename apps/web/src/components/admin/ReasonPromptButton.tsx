"use client";

export function ReasonPromptButton({
  promptMessage,
  label,
  className,
}: {
  promptMessage: string;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        const reason = window.prompt(promptMessage);
        if (reason === null) {
          event.preventDefault();
          return;
        }
        const trimmed = reason.trim();
        if (trimmed.length < 5) {
          window.alert("O motivo deve ter pelo menos 5 caracteres.");
          event.preventDefault();
          return;
        }
        const form = event.currentTarget.form;
        const reasonInput = form?.elements.namedItem("reason") as HTMLInputElement | null;
        if (reasonInput) reasonInput.value = trimmed;
      }}
    >
      {label}
    </button>
  );
}
