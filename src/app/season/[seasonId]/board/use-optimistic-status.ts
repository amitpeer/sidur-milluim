"use client";

import { useCallback, useEffect, useState } from "react";
import type { CellStatus } from "./board.types";

interface OptimisticStatus {
  readonly overrides: ReadonlyMap<string, CellStatus>;
  readonly applyOverride: (key: string, status: CellStatus) => void;
}

export function useOptimisticStatus(scheduleVersion: unknown): OptimisticStatus {
  const [overrides, setOverrides] = useState<Map<string, CellStatus>>(new Map());

  useEffect(() => {
    setOverrides(new Map());
  }, [scheduleVersion]);

  const applyOverride = useCallback((key: string, status: CellStatus) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, status);
      return next;
    });
  }, []);

  return { overrides, applyOverride };
}
