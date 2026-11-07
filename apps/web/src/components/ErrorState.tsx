"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageState } from "./feedback/PageState";
type Props = { title?: string; message: string; onRetry?: () => void };
export function ErrorState({ title = "Não foi possível carregar os imóveis", message, onRetry }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <PageState title={title} message={message} onRetry={() => startTransition(() => { if (onRetry) onRetry(); else router.refresh(); })} retrying={pending} />;
}
