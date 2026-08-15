import React, { createContext, useContext, useMemo, useRef } from "react";
import SuccessToast, { type SuccessToastHandle } from "@/components/animated/SuccessToast";

type AppFeedbackContextValue = {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
};

const AppFeedbackContext = createContext<AppFeedbackContextValue | null>(null);

/**
 * App-wide, navigation-safe feedback for ordinary saves and updates.
 * Because the toast lives above the router stack, feedback remains visible
 * when a successful action intentionally returns to the previous screen.
 */
export function AppFeedbackProvider({ children }: React.PropsWithChildren) {
  const toastRef = useRef<SuccessToastHandle>(null);
  const value = useMemo<AppFeedbackContextValue>(() => ({
    showSuccess: (message) => toastRef.current?.show(message),
    showError: (message) => toastRef.current?.showError(message),
  }), []);

  return (
    <AppFeedbackContext.Provider value={value}>
      {children}
      <SuccessToast ref={toastRef} />
    </AppFeedbackContext.Provider>
  );
}

export function useAppFeedback() {
  const context = useContext(AppFeedbackContext);
  if (!context) throw new Error("useAppFeedback must be used inside AppFeedbackProvider");
  return context;
}
