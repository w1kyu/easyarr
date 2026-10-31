# Proton VPN — set up in EasyArr

_Last checked: 31 October 2026_

Proton VPN is in the **Best for torrents** group: with a paid plan, EasyArr gets a forwarded port
from Proton automatically and puts it into qBittorrent for you.

## What you need

- A Proton VPN account. The **free plan connects**, but it only uses Proton's free servers, has
  **no port forwarding**, and Proton **doesn't allow torrents (P2P) on free servers**. It's fine
  for Usenet. The free plan also covers only one device at a time.
- For **port forwarding** (faster, more reliable torrents): **any paid Proton VPN plan**, for
  example VPN Plus. EasyArr then only uses Proton's **P2P servers** (servers that allow file
  sharing) — it picks them for you.
- A web browser to sign in at [account.protonvpn.com](https://account.protonvpn.com/login).

**Port forwarding** means other people sharing a file can connect to you directly, not only you
to them. **WireGuard** and **OpenVPN** are two ways of connecting to a VPN. WireGuard is newer
and faster, so EasyArr recommends it.

## Option A: WireGuard (recommended)

You need one value: a **private key**. It is a secret code of 44 characters that ends with `=`.

1. Sign in at [account.protonvpn.com](https://account.protonvpn.com/login) with your normal
   Proton login.
2. In the menu, open **Downloads**, then the **WireGuard configuration** section.
3. Type any name for the configuration, for example `EasyArr`.
4. Under **Platform**, pick any option (for example **Router** or **GNU/Linux**). It doesn't
   matter for EasyArr.
5. Under the **VPN options**:
   - **Paid plan:** switch **NAT-PMP (Port Forwarding)** **on**. Without it, port forwarding
     can't work later.
   - Leave **Moderate NAT** **off** — Proton says it can't be used together with port forwarding.
   - **Free plan:** you only see **VPN Accelerator**. That's fine, leave it as it is.
6. Pick any server. EasyArr chooses its own server later — the key works for all of them. (Proton
   suggests a P2P server, shown with a double-arrow icon ⇄, if you want to follow its guide
   exactly.)
7. Click **Create**. Wait a few seconds until the configuration appears.
8. Click **Download** to save the file (it ends in `.conf`). Open it with a text editor
   (Notepad, TextEdit…).
9. Find the line that starts with `PrivateKey =`. Copy everything **after** `PrivateKey = `. That
   is your WireGuard private key.

Keep this file private: anyone who has the key can use your VPN. If you lose it, simply create a
new configuration.

## Option B: OpenVPN

You need a **VPN username** and **VPN password**. These are special OpenVPN credentials that
Proton creates for you. They are **not** your normal Proton login (email + password).

1. Sign in at [account.protonvpn.com](https://account.protonvpn.com/login) with your normal
   Proton login.
2. In the menu on the left, open **Account**.
3. Find the section **OpenVPN / IKEv2 username** (Proton sometimes just calls it "OpenVPN
   username").
4. Copy the **username** and the **password** shown there.

You do **not** need to download any OpenVPN files — EasyArr already knows Proton's servers.

## Fill in EasyArr

1. In the VPN step, pick **Proton VPN** (group **Best for torrents**).
2. **Connection type:** choose **WireGuard** (if you did Option A) or **OpenVPN** (Option B).
3. Fill in the fields:

| EasyArr field         | What to paste                                                       |
| --------------------- | ------------------------------------------------------------------- |
| WireGuard private key | WireGuard only: the text after `PrivateKey = ` from your `.conf` file |
| VPN username          | OpenVPN only: your OpenVPN / IKEv2 username from the Account page   |
| VPN password          | OpenVPN only: your OpenVPN / IKEv2 password from the Account page   |

4. **I use the free plan:** tick it **only** if you have the free plan. EasyArr then uses only
   free servers and turns port forwarding off.
5. **Server country** (optional): leave **Fastest / any** unless you want a specific country.
6. **Port forwarding:** leave it **on** (the default) if you have a paid plan.
7. Press **Connect** and wait for the test.

Good to know:

- With WireGuard you don't need an address — EasyArr uses Proton's standard one (`10.2.0.2/32`).
- With OpenVPN and port forwarding on, Proton wants `+pmp` added to the end of the username.
  **EasyArr adds it for you.** Paste the username exactly as Proton shows it.

## If the test fails

- **"The key isn't right" or "Couldn't reach the VPN server" (WireGuard):** copy the key again —
  all 44 characters, with the `=` at the end and no spaces. Still failing? Create a new
  configuration in your Proton account and use its key.
- **"Username or password was refused" (OpenVPN):** you probably used your normal Proton login.
  Use the OpenVPN / IKEv2 username and password from the **Account** page instead. Also check
  your plan is still active.
- **Connected, but no forwarded port appears:** your WireGuard key was made without **NAT-PMP
  (Port Forwarding)**, or you're on the free plan. Create a new configuration with NAT-PMP
  switched on (paid plan only) and paste the new key.
- **"No server matches your choice":** choose **Fastest / any** as server country. Free plans
  only have servers in a few countries.

Back to [VPN basics](README.md).
