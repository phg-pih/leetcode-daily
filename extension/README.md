# LeetCode Daily Sync (browser extension)

Reads the live `LEETCODE_SESSION` / `csrftoken` cookies out of this browser and
pushes them to the app, twice a day. As long as you stay logged in to
leetcode.com in this browser, the server's copy never goes stale — so the 01:00
UTC cron stops failing on an expired token.

`LEETCODE_SESSION` is `httpOnly`, so page JS (and therefore a bookmarklet)
cannot read it. Only an extension holding the `cookies` permission can, which
is why this exists as an extension rather than a snippet.

## Setup

1. Put a secret in your env (both locally and in Vercel):

   ```
   EXTENSION_SECRET="$(openssl rand -base64 32)"
   ```

   If your database holds more than one user, also set `EXTENSION_USER_EMAIL`
   to the account the cookies belong to.

2. Load the extension: `chrome://extensions` → enable **Developer mode** →
   **Load unpacked** → select this `extension/` folder.

3. Open the extension popup, enter your app URL and the same secret, hit
   **Save**, then **Sync now**. Chrome will ask for permission to talk to your
   app's origin.

A red `!` badge on the extension icon means the last sync failed; open the
popup for the reason.

## Limits

- Only syncs while this browser is running. If the machine is off for longer
  than the session lifetime, the token still ages out.
- Chrome / Edge as written. Firefox needs `background.scripts` instead of
  `service_worker` in the manifest.
