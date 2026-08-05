import { Alert, Platform, type AlertButton } from "react-native";

/**
 * react-native-web ships `Alert` as a deliberate no-op (`static alert() {}`),
 * so on the web build every Alert.alert call across the app silently does
 * nothing: subscription-gating messages never appear, error reports vanish,
 * and destructive-action confirmations never resolve, which means their
 * onPress callbacks never run and the action appears dead.
 *
 * The app has 40+ Alert.alert call sites that are correct as written, so the
 * fix is to supply the missing platform implementation once rather than
 * rewrite every caller.
 *
 * Known limitation: window.confirm models at most two choices, so a prompt
 * with three or more buttons is presented as a sequence of confirms in the
 * order the buttons were declared. Cancel-styled buttons are always the
 * dismissal path.
 */
export function installWebAlert() {
  if (Platform.OS !== "web") return;
  if (typeof window === "undefined") return;
  if ((Alert as { __royallagnWebAlertInstalled?: boolean }).__royallagnWebAlertInstalled) return;

  Alert.alert = (title?: string, message?: string, buttons?: AlertButton[]) => {
    const heading = [title, message].filter(Boolean).join("\n\n");
    const list = buttons?.length ? buttons : [{ text: "OK" } as AlertButton];
    const cancel = list.find((button) => button.style === "cancel");
    const choices = list.filter((button) => button.style !== "cancel");

    // Informational prompt: nothing to choose between.
    if (choices.length <= 1 && !cancel) {
      window.alert(heading);
      choices[0]?.onPress?.();
      return;
    }

    for (const choice of choices) {
      const label = choice.text ? `${heading}\n\n${choice.text}?` : heading;
      if (window.confirm(label)) {
        choice.onPress?.();
        return;
      }
    }
    cancel?.onPress?.();
  };

  (Alert as { __royallagnWebAlertInstalled?: boolean }).__royallagnWebAlertInstalled = true;
}
