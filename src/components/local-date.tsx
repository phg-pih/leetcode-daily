"use client";

import { useEffect, useState } from "react";

export function LocalDate({ date }: { date: Date | string }) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    setFormatted(
      new Date(date).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    );
  }, [date]);

  if (!formatted) return null;

  return <span>{formatted}</span>;
}
