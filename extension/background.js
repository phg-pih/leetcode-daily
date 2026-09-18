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
  return chrome.cookies.get({ url: "https://leetcode.com", name });
}

async function sync() {
  const { appUrl, secret } = await chrome.storage.local.get(["appUrl", "secret"]);
  if (!appUrl || !secret) return await record({ ok: false, error: "Not configured yet" });

  const sessionCookie = await readCookie("LEETCODE_SESSION");
  const csrfCookie = await readCookie("csrftoken");
  if (!sessionCookie?.value || !csrfCookie?.value) {
    return await record({ ok: false, error: "No LeetCode cookies — log in to leetcode.com first" });
  }

  try {
    const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/extension/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      // expirationDate is seconds since epoch, and is the browser's own view of
      // when this cookie dies — more trustworthy than anything in the payload.
      body: JSON.stringify({
        lcSession: sessionCookie.value,
        lcCsrfToken: csrfCookie.value,
        expiresAt: sessionCookie.expirationDate ?? null,
      }),
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
