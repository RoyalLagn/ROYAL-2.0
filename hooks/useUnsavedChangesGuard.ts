import { useEffect } from "react";
import { Alert, Platform } from "react-native";
import { useNavigation, usePreventRemove } from "@react-navigation/native";

type UnsavedChangesGuardOptions = {
  title?: string;
  message?: string;
};

/**
 * Protects editable screens from accidental navigation while keeping the
 * confirmation native on iOS/Android and compatible with the shared web
 * dialog adapter. Browser refresh/close also receives the platform-standard
 * warning because custom dialog copy is intentionally unavailable there.
 */
export function useUnsavedChangesGuard(
  enabled: boolean,
  options: UnsavedChangesGuardOptions = {},
) {
  const navigation = useNavigation();
  const title = options.title ?? "Discard unsaved changes?";
  const message = options.message ?? "Your changes have not been saved. If you leave now, they will be lost.";

  usePreventRemove(enabled, ({ data }) => {
    Alert.alert(title, message, [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard changes",
        style: "destructive",
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  useEffect(() => {
    if (Platform.OS !== "web" || !enabled) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [enabled]);
}
