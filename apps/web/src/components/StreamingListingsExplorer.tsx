"use client";

import { useEffect, useState, type ComponentProps } from "react";
import type { Listing } from "@zhivago/shared";
import { ListingsExplorer } from "./ListingsExplorer";

type Result = { listings: Listing[]; loadError: boolean };
type Props = Omit<ComponentProps<typeof ListingsExplorer>, "listings" | "loadError" | "loading"> & {
  result: Promise<Result>;
};

// The server still fetches the data. Keep the interactive search mounted while
// its result streams in, including filters changed during a slow request.
export function StreamingListingsExplorer({ result, ...props }: Props) {
  const [resolved, setResolved] = useState<{ source: Promise<Result>; data: Result } | null>(null);
  useEffect(() => {
    let active = true;
    result.then((data) => {
      if (active) setResolved({ source: result, data });
    }, () => {
      if (active) setResolved({ source: result, data: { listings: [], loadError: true } });
    });
    return () => { active = false; };
  }, [result]);

  return (
    <div aria-busy={resolved?.source !== result}>
      <ListingsExplorer {...props} listings={resolved?.data.listings ?? []}
        loadError={resolved?.data.loadError ?? false} loading={resolved === null} />
    </div>
  );
}
