"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";

interface NotificationConfig {
  type: string;
  target: string;
  enabled: boolean;
}

export default function SettingsPage() {
  const [lcUsername, setLcUsername] = useState("");
  const [lcSession, setLcSession] = useState("");
  const [lcCsrfToken, setLcCsrfToken] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [hasCsrfToken, setHasCsrfToken] = useState(false);
  const [notifications, setNotifications] = useState<NotificationConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      setLcUsername(d.lcUsername ?? "");
      setHasSession(d.hasSession);
      setHasCsrfToken(d.hasCsrfToken);
    });
    fetch("/api/notifications").then((r) => r.json()).then(setNotifications);
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lcUsername,
        ...(lcSession && { lcSession }),
        ...(lcCsrfToken && { lcCsrfToken }),
      }),
    });

    setSaving(false);
    setLcSession("");
    setLcCsrfToken("");
    setHasSession(true);
    setHasCsrfToken(true);
    setMessage("Settings saved.");
  }

  async function saveNotification(type: string, target: string, enabled: boolean) {
    await fetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, target, enabled }),
    });
    const updated = await fetch("/api/notifications").then((r) => r.json());
    setNotifications(updated);
  }

  const telegram = notifications.find((n) => n.type === "telegram");
  const email = notifications.find((n) => n.type === "email");

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard" className="text-gray-500 hover:text-white transition text-sm">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </div>

      {/* LeetCode credentials */}
      <form onSubmit={saveSettings} className="bg-gray-900 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">LeetCode Account</h2>

        <label className="block text-sm text-gray-400 mb-1">Username</label>
        <input
          value={lcUsername}
          onChange={(e) => setLcUsername(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 mb-4 focus:outline-none focus:border-orange-500 text-sm"
          placeholder="your-lc-username"
        />

        <label className="block text-sm text-gray-400 mb-1">
          Session Cookie{" "}
          {hasSession && <span className="text-green-400">(currently set)</span>}
        </label>
        <input
          value={lcSession}
          onChange={(e) => setLcSession(e.target.value)}
          type="password"
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 mb-1 focus:outline-none focus:border-orange-500 text-sm"
          placeholder={hasSession ? "Leave blank to keep current" : "Paste LEETCODE_SESSION cookie"}
        />
        <p className="text-xs text-gray-600 mb-4">
          Find it in browser DevTools → Application → Cookies → leetcode.com → LEETCODE_SESSION
        </p>

        <label className="block text-sm text-gray-400 mb-1">
          CSRF Token{" "}
          {hasCsrfToken && <span className="text-green-400">(currently set)</span>}
        </label>
        <input
          value={lcCsrfToken}
          onChange={(e) => setLcCsrfToken(e.target.value)}
          type="password"
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 mb-1 focus:outline-none focus:border-orange-500 text-sm"
          placeholder={hasCsrfToken ? "Leave blank to keep current" : "Paste csrftoken cookie"}
        />
        <p className="text-xs text-gray-600 mb-4">
          Same location → csrftoken cookie
        </p>

        {message && <p className="text-green-400 text-sm mb-3">{message}</p>}

        <button
          type="submit"
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg transition text-sm"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      {/* Notifications */}
      <div className="bg-gray-900 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Notifications</h2>

        <NotificationRow
          label="Telegram"
          type="telegram"
          placeholder="Chat ID (e.g. 123456789)"
          current={telegram}
          onSave={saveNotification}
        />
        <NotificationRow
          label="Email"
          type="email"
          placeholder="you@example.com"
          current={email}
          onSave={saveNotification}
        />
      </div>
    </div>
  );
}

function NotificationRow({
  label,
  type,
  placeholder,
  current,
  onSave,
}: {
  label: string;
  type: string;
  placeholder: string;
  current?: NotificationConfig;
  onSave: (type: string, target: string, enabled: boolean) => void;
}) {
  const [target, setTarget] = useState(current?.target ?? "");
  const [enabled, setEnabled] = useState(current?.enabled ?? false);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [testError, setTestError] = useState("");

  useEffect(() => {
    setTarget(current?.target ?? "");
    setEnabled(current?.enabled ?? false);
  }, [current]);

  async function sendTest() {
    if (!target) return;
    setTestStatus("sending");
    setTestError("");
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, target }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestStatus("ok");
      } else {
        setTestStatus("error");
        setTestError(data.error ?? "Unknown error");
      }
    } catch {
      setTestStatus("error");
      setTestError("Request failed");
    }
    setTimeout(() => setTestStatus("idle"), 4000);
  }

  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-300">{label}</label>
        <button
          type="button"
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            onSave(type, target, next);
          }}
          className={`relative w-10 h-5 rounded-full transition ${enabled ? "bg-orange-500" : "bg-gray-700"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : ""}`}
          />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500 text-sm"
        />
        <button
          type="button"
          onClick={() => onSave(type, target, enabled)}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-2 rounded-lg transition"
        >
          Save
        </button>
        <button
          type="button"
          onClick={sendTest}
          disabled={!target || testStatus === "sending"}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm px-3 py-2 rounded-lg transition"
        >
          {testStatus === "sending" ? "…" : testStatus === "ok" ? "✓ Sent" : "Test"}
        </button>
      </div>
      {testStatus === "error" && (
        <p className="text-red-400 text-xs mt-1">{testError}</p>
      )}
    </div>
  );
}
