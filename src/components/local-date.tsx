"use client";

export function LocalDate({ date }: { date: Date | string }) {
  return (
    <span>
      {new Date(date).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })}
    </span>
  );
}
