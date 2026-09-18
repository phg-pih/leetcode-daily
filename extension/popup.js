const $ = (id) => document.getElementById(id);

(async function load() {
  const { appUrl, secret, lastStatus } = await chrome.storage.local.get(["appUrl", "secret", "lastStatus"]);
  if (appUrl) $("appUrl").value = appUrl;
  if (secret) $("secret").value = secret;
  render(lastStatus);
})();

$("save").addEventListener("click", async () => {
  const appUrl = $("appUrl").value.trim();
  const secret = $("secret").value.trim();
  if (!appUrl || !secret) return render({ ok: false, error: "Both fields are required" });

  let origin;
  try {
    origin = new URL(appUrl).origin;
  } catch {
    return render({ ok: false, error: "That isn't a valid URL" });
  }

  // host_permissions can't be declared for a URL we don't know at build time,
  // so ask for it here where we still have the user gesture.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) return render({ ok: false, error: "Permission for that origin was denied" });

  await chrome.storage.local.set({ appUrl: origin, secret });
  render({ ok: true, saved: true });
});

$("syncNow").addEventListener("click", async () => {
  $("status").textContent = "Syncing…";
  render(await chrome.runtime.sendMessage({ type: "sync" }));
});

function render(status) {
  const el = $("status");
  if (!status) return (el.textContent = "Never synced yet.");
  if (!status.ok) {
    el.className = "bad";
    return (el.textContent = `Failed: ${status.error}`);
  }
  el.className = "ok";
  if (status.saved) return (el.textContent = "Saved. Hit “Sync now” to test it.");
  const left = status.daysLeft == null ? "" : ` — session valid ~${status.daysLeft} more days`;
  el.textContent = `Synced ${new Date(status.at).toLocaleString()}${left}`;
}
