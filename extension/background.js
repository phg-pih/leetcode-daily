const ALARM = "lc-daily-sync";
const PERIOD_MINUTES = 720; // twice a day; the cron only needs it fresh once

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES, delayInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  sync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) sync();
});

// Popup asks for a manual sync through here so both paths share one code path.
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.type === "sync") {
    sync().then(respond);
    return true; // keep the channel open for the async response
  }
});

async function readCookie(name) {
  const cookie = await chrome.cookies.get({ url: "https://leetcode.com", name });
  return cookie?.value ?? null;
}

async function sync() {
  const { appUrl, secret } = await chrome.storage.local.get(["appUrl", "secret"]);
  if (!appUrl || !secret) return await record({ ok: false, error: "Not configured yet" });

  const lcSession = await readCookie("LEETCODE_SESSION");
  const lcCsrfToken = await readCookie("csrftoken");
  if (!lcSession || !lcCsrfToken) {
    return await record({ ok: false, error: "No LeetCode cookies — log in to leetcode.com first" });
  }

  try {
    const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/extension/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ lcSession, lcCsrfToken }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return await record({ ok: false, error: body.error ?? `HTTP ${res.status}` });
    return await record({ ok: true, daysLeft: body.daysLeft ?? null });
  } catch (err) {
    return await record({ ok: false, error: String(err) });
  }
}

async function record(status) {
  const entry = { ...status, at: new Date().toISOString() };
  await chrome.storage.local.set({ lastStatus: entry });
  chrome.action.setBadgeText({ text: status.ok ? "" : "!" });
  chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  return entry;
}
