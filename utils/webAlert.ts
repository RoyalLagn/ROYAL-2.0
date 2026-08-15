import { Alert, Platform, type AlertButton, type AlertOptions } from "react-native";

export type AppAlertRequest = {
  title?: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

type AlertPresenter = (request: AppAlertRequest) => void;
type PatchedAlert = typeof Alert & {
  __royallagnAlertInstalled?: boolean;
  __royallagnOriginalAlert?: typeof Alert.alert;
};

let presenter: AlertPresenter | null = null;

function browserFallback(request: AppAlertRequest) {
  if (typeof window === "undefined") return;
  const heading = [request.title, request.message].filter(Boolean).join("\n\n");
  const cancel = request.buttons.find((button) => button.style === "cancel");
  const choices = request.buttons.filter((button) => button.style !== "cancel");
  if (choices.length <= 1 && !cancel) {
    window.alert(heading);
    choices[0]?.onPress?.();
    return;
  }
  for (const choice of choices) {
    if (window.confirm(`${heading}\n\n${choice.text || "Continue"}?`)) {
      choice.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
}

/**
 * Routes web Alert.alert calls through the shared RoyalLagn dialog provider.
 * iOS and Android keep React Native's system alert so button order, dismissal,
 * accessibility, typography, and destructive actions follow each OS.
 */
export function installAppAlert() {
  if (Platform.OS !== "web") return;
  const target = Alert as PatchedAlert;
  if (target.__royallagnAlertInstalled) return;
  target.__royallagnOriginalAlert = Alert.alert.bind(Alert);

  Alert.alert = (title, message, buttons, options) => {
    const request: AppAlertRequest = {
      title,
      message,
      buttons: buttons?.length ? buttons : [{ text: "OK" }],
      options,
    };
    if (presenter) {
      presenter(request);
      return;
    }
    if (Platform.OS === "web") {
      browserFallback(request);
      return;
    }
    target.__royallagnOriginalAlert?.(title, message, buttons, options);
  };
  target.__royallagnAlertInstalled = true;
}

export function registerAppAlertPresenter(nextPresenter: AlertPresenter) {
  presenter = nextPresenter;
  return () => {
    if (presenter === nextPresenter) presenter = null;
  };
}

/** Backwards-compatible alias for older imports. */
export const installWebAlert = installAppAlert;
