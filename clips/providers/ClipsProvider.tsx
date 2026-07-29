import React, { createContext, useCallback, useMemo, useState } from "react";
import type { Clip, ClipCursor } from "../types";

export interface ClipsContextValue {
  clips: Clip[];
  cursor: ClipCursor | null;
  loading: boolean;
  setClips: React.Dispatch<React.SetStateAction<Clip[]>>;
  setCursor: React.Dispatch<React.SetStateAction<ClipCursor | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  reset: () => void;
}

export const ClipsContext = createContext<ClipsContextValue | null>(null);

export function ClipsProvider({ children }: { children: React.ReactNode }) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [cursor, setCursor] = useState<ClipCursor | null>(null);
  const [loading, setLoading] = useState(false);
  const reset = useCallback(() => {
    setClips([]);
    setCursor(null);
    setLoading(false);
  }, []);
  const value = useMemo(
    () => ({ clips, cursor, loading, setClips, setCursor, setLoading, reset }),
    [clips, cursor, loading, reset],
  );
  return <ClipsContext.Provider value={value}>{children}</ClipsContext.Provider>;
}
