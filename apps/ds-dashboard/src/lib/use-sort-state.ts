import { useCallback, useState } from "react";

export type SortDirection = "asc" | "desc";

export function useSortState<F extends string>(initial: {
  field: F;
  dir: SortDirection;
}) {
  const [sort, setSort] = useState(() => ({ ...initial }));

  const toggle = useCallback((field: F) => {
    setSort((current) =>
      current.field === field
        ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  }, []);

  return [sort, toggle] as const;
}
