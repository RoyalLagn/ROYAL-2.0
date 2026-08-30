import { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { getPublicClipsEnabled } from "@/services/publicClipsAvailability";

export function usePublicClipsAvailability() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;

    const refresh = () => {
      void getPublicClipsEnabled()
        .then((value) => {
          if (active) setEnabled(value);
        })
        .catch(() => {
          // Fail closed so unavailable Clips are never exposed by a transient read error.
          if (active) setEnabled(false);
        });
    };

    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []));

  return enabled;
}
