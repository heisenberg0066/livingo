# Livingo

Livingo is a private streak for exactly two people. One teaches Swedish, the other teaches French, and the meanings are always in English. A day counts only when both of you have added your words.

Production builds talk to the Supabase project in `src/lib/supabaseDefaults.ts`. `npm run dev` still starts on this device, and **Try the sample pair** stays available in production without opening Connection. Before the first real pair, run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL editor. Anonymous sign-ins must be on.

The website for GitHub Pages is built with `VITE_BASE=/livingo/` so it is served at `https://heisenberg0066.github.io/livingo/`. The Android package is built with `VITE_BASE=./` and the same Supabase project.

Ammar can use it as a website on his laptop and as an iPhone home-screen app. His friend can install the Android app built from the same project. Nothing here requires a paid account to try, and two phones can sync through the small server in this repo.

## Try it with no accounts

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:47321](http://127.0.0.1:47321). Choose **Try the sample pair**. You land as Ammar, with an 8-day streak, a freeze already used this week, and Camille still owing today's word. **Continue as Camille** on the home screen, add her word, and the day seals.

The sample pair stays in this browser. Two tabs in the same browser can also create a real pair: one starts it and reads the code, the other joins. That data is not shared with another phone.

## How a day works

Each word is stamped with the calendar date where its author lives. You can only add words for your own today, so the day closes at your midnight, not at a shared timezone.

A shared date is complete when both people have added at least the streak's daily limit of words dated that day. Extra words still become cards. The open day does not break anything.

Each ISO week (Monday to Sunday) includes one automatic freeze. The first missed date in that week is saved and the flame continues. A second miss in the same week pauses the streak. The home screen shows whether this week's freeze is still ready.

You can run more than one streak. Each has its own name and daily limit (1 to 5). Either of you can change the limit; that recalculates the flame.

## Share it between the two phones

Pick a connection on the welcome screen, or later under **Pair → Connection**.

### This device

No server. Good for learning the app and for two tabs on one browser.

### Sync server (no account)

This is the path that works end to end without Firebase, Supabase, or a credit card.

```bash
npm install
npm run build
npm start
```

That serves the website and the API together on port **47322**. Data and voice notes live in `server/data/` (gitignored). The first boot writes a VAPID keypair to `server/data/vapid.json`. Keep that file. If you delete it, phones have to turn notifications on again.

On a laptop, open `http://127.0.0.1:47322`. On a phone on the same Wi-Fi, open `http://YOUR_LAN_IP:47322`. One person creates the pair, the other joins with the code.

The Android app does not use that page automatically. In the app, open **Connection**, choose **Sync server**, and enter `http://YOUR_LAN_IP:47322`. The debug APK allows plain HTTP so a home network works. Prefer HTTPS once you leave the house.

For an iPhone, a home-screen icon on plain HTTP will not receive background push. Put the server behind HTTPS. A free Cloudflare Tunnel, Caddy, or any host that terminates TLS is enough. Point both the site and `/api` at this process so they share one origin, and leave `VITE_API_URL` empty when you build.

Useful environment variables (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `PORT` | API port. Default `47322`. |
| `HOST` | Default `0.0.0.0`. |
| `DATA_DIR` | Where `db.json`, media, and VAPID keys live. |
| `SERVE_STATIC` | Set to `0` to serve the API only. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional. Otherwise the server mints keys. `VAPID_SUBJECT` must be a `mailto:` or `https:` URL. |

`npm run dev:full` runs the Vite app on 47321 and the API on 47322, with Vite proxying `/api`.

### Supabase (free tier, optional)

Use this if you want hosted storage instead of the process above.

1. Create a project at [supabase.com](https://supabase.com). The free tier is enough for two people.
2. Authentication → Sign In / Providers → enable **Anonymous sign-ins**.
3. SQL editor → paste and run [`supabase/schema.sql`](supabase/schema.sql). That creates the tables, the invite-code functions, row policies, a private `livingo-media` bucket, and realtime.
4. Project Settings → API. Copy the project URL and the `anon` public key. Do not put the service role key in the app.
5. In Livingo, open **Connection → Supabase**, paste both, and save.

The anon key is meant to be public. The SQL policies only let a signed-in member read their own pair.

Locked-screen "your friend added a word" push on the Supabase path is optional. Deploy `supabase/functions/notify` and a database webhook on `public.words` INSERT with the header `x-livingo-webhook`. Secrets: `WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Put the public key in the connection screen too. Evening reminders on Android do not need this function. The sync server already sends both kinds of push if you use that instead.

## Install it

### Laptop and iPhone

The site is a progressive web app.

- Laptop: in Chrome or Edge, use the install icon in the address bar.
- iPhone: open the site in Safari, tap Share, then **Add to Home Screen**. Push works from that icon on iOS 16.4 or newer, and only over HTTPS.

Any static host works for the website alone (Netlify, Cloudflare Pages, GitHub Pages with a SPA fallback). `public/_redirects` already rewrites routes to `index.html` for Netlify. Static hosting does not sync the two phones. Run `npm start` or Supabase for that. If the site and API are on different origins, build with `VITE_API_URL` set to the API origin, or set the address in Connection.

### Android APK

The debug APK is signed with the Android debug key. That is the right build for the two of you. Allow installs from your files app, then open the APK.

Local build, with the Android SDK and JDK 21 installed:

```bash
export ANDROID_HOME="$HOME/android-sdk"   # wherever your SDK lives
bash scripts/build-apk.sh
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

GitHub Actions does the same thing. The workflow [`.github/workflows/android-apk.yml`](.github/workflows/android-apk.yml) runs on pushes to `main` and when you start it by hand. Download `livingo-debug-apk` from the run's artifacts.

The app id is `app.livingo.pair`. It asks for the microphone, photos, and notifications when you use those features. Text-to-speech uses the Android voice for `sv-SE` or `fr-FR`. If a word will not speak, install that language's voice in the phone's system settings. The web app falls back to the browser's speech engine.

Out of the box the APK opens in demo mode, so it is useful before any server exists. Point Connection at your sync server when you want the real pair.

## Notifications

| | Evening reminder if today's word is missing | When the other person adds a word |
| --- | --- | --- |
| App open, any mode | Yes, at the time you set (default 20:00 in your time zone) | In-app banner |
| Android app, closed | Yes, a local notification scheduled on the phone | Banner the next time the app is open. A browser pointed at the sync server also gets web push |
| Installed PWA and the sync server | Web push, including iOS home screen on 16.4+ over HTTPS | Web push |
| Supabase | On-device reminder while the app is open, and the Android local notification | Banner while open. Locked-screen push only if you deploy the optional function |

Turn them on from **Pair → Turn on reminders**. The browser or phone will ask permission there, not on the first screen.

## Cards, quiz, and search

A card is a word plus its English meaning. Either person can add an explanation, pictures, and voice notes up to 30 seconds. Either person can edit or delete a word. Deleting today's word opens that slot again. Editing does not move the word onto a different day.

**Words** searches the word, the meaning, and the note, and can filter Swedish, French, or yours.

**Quiz** defaults to the language you are learning. You can flip the direction or mix it. Cards you miss come back tomorrow. Cards you know wait longer (a small SM-2 schedule). Up to eight due cards in a round.

## Tests

```bash
npm test
```

That covers time zones, the freeze rule, spaced repetition, and a two-person pass through the sync server including a picture upload.

## What you still need to provide

You can use the whole interface, the sample pair, the quiz, and a single-browser pair with no keys at all.

| Want | You provide |
| --- | --- |
| Two phones staying in sync, no third-party account | A machine that runs `npm start`, reachable by both phones. HTTPS if the iPhone should get background push. |
| Hosted sync | A free Supabase project, anonymous sign-ins on, `supabase/schema.sql` applied, the project URL and anon key pasted into Connection. |
| Supabase locked-screen push | VAPID keys and the `notify` function deployed. Skip this if you use the sync server. |
| Swedish or French speech on Android | The `sv-SE` and `fr-FR` system voices, if the phone did not ship with them. |
| A Play Store listing | Your own upload keystore. The debug APK does not need one. |

No email service, no Firebase project, and no Apple developer account are required for the website, the home-screen app, or the sideloaded APK.
