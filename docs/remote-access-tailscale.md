# Watch away from home (Tailscale)

At home, your TV and phone reach EasyArr's Jellyfin through your home network. Away from home they
can't, because your Umbrel isn't on the internet. That's good: it keeps strangers out.

**Tailscale** is a free app that connects your own devices to each other, wherever they are, as if
they were at home. Nobody else can reach your Umbrel through it. There's an official Tailscale app
for Umbrel.

> **What you'll need**
>
> - A free Tailscale account (sign in with Google, Microsoft, Apple or GitHub).
> - The phone, tablet or laptop you want to watch on.
> - About 10 minutes.

Tailscale and EasyArr's VPN don't get in each other's way. EasyArr's VPN only carries the
downloads. Tailscale only connects your own devices.

## 1. Install Tailscale on your Umbrel

1. Open your Umbrel's **App Store** and search for **Tailscale**.
2. Click **Install**.
3. Open the **Tailscale** app from your Umbrel's home screen.
4. Click **Log in** and sign in to your Tailscale account (or create one).

Your Umbrel is now part of your own private Tailscale network.

## 2. Install Tailscale on your phone or laptop

1. Install **Tailscale** from your device's app store (iPhone, Android) or from
   [tailscale.com/download](https://tailscale.com/download) (Windows, Mac, Linux).
2. Open it and sign in with **the same account** as on the Umbrel.
3. Turn Tailscale on.

## 3. Find your Umbrel's Tailscale address

1. In the Tailscale app on your phone or laptop, open the list of devices.
2. Find your Umbrel. It's usually called **umbrel**.
3. Note its address. It starts with `100.`, for example `100.101.102.103`.

## 4. Watch

Make sure Tailscale is turned on, then use the Tailscale address instead of `umbrel.local`:

| What | Address |
| ---- | ------- |
| Jellyfin (watch) | `http://100.101.102.103:39096` |
| Request page | `http://100.101.102.103:39055` |
| Your Umbrel and the EasyArr dashboard | `http://100.101.102.103` |

Use your own Tailscale address, not the example.

In the **Jellyfin app** on your phone, add the Tailscale address as a second server, or change the
server address to it. The Tailscale address also works at home while Tailscale is on, so you can
simply use it everywhere.

If your Tailscale has **MagicDNS** turned on (the default for new accounts), `http://umbrel:39096`
works too.

## Good to know

- **Speed.** Away from home, video comes from your home internet's **upload** speed, which is often
  much slower than your download speed. If videos stutter, choose a lower quality in the Jellyfin
  app (the ⚙ button while a video plays).
- **TVs** usually can't run Tailscale. At a friend's house, use your phone or laptop instead.
- **Don't open ports on your router** for Jellyfin or EasyArr. Tailscale is the safe way in.
- **Family members** away from home need Tailscale too. You can share your Umbrel with them from
  the Tailscale website (**Share** next to the device), so they don't need access to your other
  devices.
