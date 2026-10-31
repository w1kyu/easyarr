# Private Internet Access (PIA) — set up in EasyArr

_Last checked: 31 October 2026_

PIA is in EasyArr's **Best for torrents** group: it has **automatic port forwarding**, which
makes torrents faster. EasyArr connects to PIA with **OpenVPN**. (PIA's WireGuard needs an extra
login step that EasyArr's VPN part doesn't support yet. OpenVPN is just as safe.)

PIA is one of the easiest providers to set up: you only need your normal PIA login. No keys, no
files.

## What you need

- An active, paid PIA subscription.
- Your **PIA username**. It's the letter `p` followed by 7 digits, like `p1234567`. It is **not**
  your email address.
- Your **PIA password** (the one you also use in the PIA app).

## Find your username and password

1. Search your email inbox for the message PIA sent when you bought your subscription. It
   contains your username and password.
2. Can't find it? Your username is also shown in the PIA app under **Settings → Account**.
3. Forgot your password? Reset it on PIA's website at
   `privateinternetaccess.com/account/reset-password`.
4. To double-check both, log in to your account on **privateinternetaccess.com** with them. If
   that works, EasyArr will accept them too.

PIA's help pages sometimes call these your "VPN service credentials". For OpenVPN that's the same
`p1234567` username and your account password. (A username starting with `x` is PIA's separate
proxy login — don't use it here.)

## Port forwarding — what to know

- In EasyArr, **Port forwarding** is **on** by default for PIA. You don't need to change anything
  in your PIA account.
- Each time EasyArr connects, it asks PIA for a port and puts it into qBittorrent for you. If PIA
  hands out a new port later, EasyArr updates qBittorrent automatically.
- **PIA doesn't offer port forwarding on its US server locations** (PIA's help pages, checked
  31 October 2026). While the switch is on, EasyArr only lists regions that support port
  forwarding, and **Fastest / any** only uses those. Right now that's every region outside the US.
- Need a US server? Turn **Port forwarding** off. Torrents still work, just slower.
- Only use Usenet? Port forwarding doesn't matter for you. You can leave it on or off.

## Fill in EasyArr

1. In the VPN step of the setup (or later in **Settings → VPN**), choose **Private Internet
   Access (PIA)** in the **Best for torrents** group. The connection type is **OpenVPN**.
2. Fill in the fields:

| EasyArr field       | What to enter                                             |
| ------------------- | --------------------------------------------------------- |
| **VPN username**    | Your PIA username, like `p1234567`                        |
| **VPN password**    | Your PIA password                                         |
| **Port forwarding** | Leave it **on** (recommended for torrents)                |
| **Server region**   | Optional: a region close to you, or **Fastest / any**     |

3. Press **Connect**. EasyArr tests the connection. You should see **Connected to Private Internet
   Access (PIA)**, **Your home IP is hidden** and **Port forwarding is on (port …)**.
4. If it says **Waiting for your VPN to hand out a port…**, give it a minute. PIA usually sends
   the port within a few seconds of connecting.

## If the test fails

- **"Username or password was refused":** you entered your email address instead of the
  `p1234567` username, or there's a typo in the password. Check both by logging in on
  privateinternetaccess.com, and make sure your subscription is active.
- **"No server matches your choice" or "Pick a location from the list":** the region you picked
  has no port forwarding (all US regions, for example). Choose **Fastest / any** or another
  region, or turn port forwarding off.
- **Port forwarding keeps waiting:** pick another region and press **Connect** again. Some
  regions are busy now and then.
- **"Couldn't reach the VPN server":** that PIA region may be down for a moment. Try another
  region or **Fastest / any**.

Back to [VPN basics](README.md).
