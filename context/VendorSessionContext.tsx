import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type VendorSessionContextValue = {
  isPreviewMode: boolean;
  workspaceEpoch: number;
  enterPreviewMode: () => void;
  clearPreviewMode: () => void;
};

const VendorSessionContext = createContext<VendorSessionContextValue | null>(null);

export function VendorSessionProvider({ children }: { children: React.ReactNode }) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);

  const enterPreviewMode = useCallback(() => {
    setIsPreviewMode(true);
    setWorkspaceEpoch((value) => value + 1);
  }, []);

  const clearPreviewMode = useCallback(() => {
    setIsPreviewMode(false);
    setWorkspaceEpoch((value) => value + 1);
  }, []);

  const value = useMemo(() => ({
    isPreviewMode,
    workspaceEpoch,
    enterPreviewMode,
    clearPreviewMode,
  }), [clearPreviewMode, enterPreviewMode, isPreviewMode, workspaceEpoch]);

  return (
    <VendorSessionContext.Provider value={value}>
      {children}
    </VendorSessionContext.Provider>
  );
}

export function useVendorSession() {
  const value = useContext(VendorSessionContext);
  if (!value) throw new Error("useVendorSession must be used inside VendorSessionProvider.");
  return value;
}
