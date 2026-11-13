(() => {
  const launchUrl = document.documentElement.dataset.launchUrl;
  if (!["/?source=pwa", "/vendor-dashboard?source=pwa"].includes(launchUrl)) return;
  const standalone = navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
  if (standalone) {
    location.replace(launchUrl);
    return;
  }
  const button = document.getElementById("install-button");
  const status = document.getElementById("install-status");
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
    button.hidden = false;
  });
  button.addEventListener("click", async () => {
    if (!deferred) return;
    button.disabled = true;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      status.textContent = outcome === "accepted" ? "Installation requested. Open the app from your Home Screen." : "Installation dismissed. You can try again from your browser menu.";
    } catch {
      status.textContent = "Use your browser menu to add this app to your Home Screen.";
    } finally {
      deferred = null;
      button.hidden = true;
      button.disabled = false;
    }
  });
  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    status.textContent = "App installed. Open it from your Home Screen.";
  });
  if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => undefined);
  }
})();
