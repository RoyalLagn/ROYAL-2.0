let recoverySessionActive = false;

export function markRecoverySessionActive() {
  recoverySessionActive = true;
}

export function clearRecoverySession() {
  recoverySessionActive = false;
}

export function isRecoverySessionActive() {
  return recoverySessionActive;
}
