# Other providers

_Last checked: 31 October 2026_

EasyArr works with many VPN providers. The most common ones have their own step-by-step guide (see
[VPN basics](README.md)). This page is for all the others:

Windscribe, IVPN, FastestVPN, ExpressVPN, IPVanish, HideMyAss, Privado, PureVPN, TorGuard,
VyprVPN, SlickVPN, Giganews, CyberGhost, VPN Unlimited, VPNSecure, PrivateVPN and Perfect Privacy.

Every provider's website looks different, but the steps are almost always the same.

## Step 1: Find the "manual setup" page

EasyArr isn't an app from your provider, so you need the details for setting up a VPN "by hand".
Log in on your provider's website and look for a page called something like:

- **Manual setup** or **Manual configuration**
- **Router** or **Other devices**
- **Linux**
- **OpenVPN** or **WireGuard** (often under "Downloads" or "Config generator")

If you can't find it, search the provider's help pages for "manual setup" or "OpenVPN". That's also
the best place to check when something below doesn't match what you see.

## Step 2: WireGuard or OpenVPN?

When you pick your provider in EasyArr, it shows which **connection types** it supports. If you can
choose, use **WireGuard** — it's faster and simpler (see [VPN basics](README.md)).

## WireGuard: copy three lines from a file

On the manual setup page, generate a **WireGuard configuration** (pick any server — EasyArr only
needs your personal key, and it chooses servers itself). You get a small text file ending in
`.conf`. Open it with any text editor. It looks roughly like this:

```ini
[Interface]
PrivateKey = wOEI9rqqbDwnN8/Bpp22sVz48T71vJ4fYmFWujulwUU=
Address = 10.64.222.21/32
DNS = 10.255.255.1

[Peer]
PublicKey = ...
PresharedKey = ...
Endpoint = ...
```

Copy these values into EasyArr:

| Line in the file | Field in EasyArr        | Notes                                                      |
| ---------------- | ----------------------- | ---------------------------------------------------------- |
| `PrivateKey =`   | WireGuard private key   | 44 characters ending in `=`. Keep it secret.               |
| `Address =`      | WireGuard address       | Something like `10.64.222.21/32`. An IPv6 part is ignored. |
| `PresharedKey =` | WireGuard preshared key | Only if EasyArr asks for it and the line exists.           |

Copy only the value after `=` — not the word `PrivateKey` itself. The other lines (DNS, PublicKey,
Endpoint, AllowedIPs) aren't needed: EasyArr already knows your provider's servers.

## OpenVPN: special "service credentials"

Most providers use a **separate username and password for OpenVPN**. They are **not** the email and
password you use on the website. On the manual setup page they're often called "service
credentials", "OpenVPN credentials" or "manual setup credentials". Enter them as **VPN username**
and **VPN password**.

If EasyArr says "Username or password was refused", this mix-up is the most common reason. Also
check that your subscription is active.

### Certificates and keys

A few providers (see the table below) also need a **certificate** and a **key**. You find them in
the OpenVPN file (`.ovpn`) you download from the manual setup page. Open it with a text editor:

- **Client certificate** = everything between `<cert>` and `</cert>`
- **Client key** = everything between `<key>` and `</key>`

Some providers give these as separate files instead (for example `client.crt` and `client.key`).
Then paste the whole content of each file. It's fine to include the `-----BEGIN ...-----` and
`-----END ...-----` lines; EasyArr removes them.

## Hints per provider

"PF" = port forwarding (see [VPN basics](README.md#port-forwarding-in-plain-words)). If a hint
doesn't match what you see, your provider's manual setup page is always right.

**Windscribe** — WireGuard or OpenVPN. PF: no.

- WireGuard: private key, address **and** preshared key — all three are required. Use Windscribe's
  WireGuard config generator.
- OpenVPN: the username and password shown by Windscribe's OpenVPN config generator, not your login.
- "Build a Plan" subscription: choose one of the locations you paid for as the server location.
  "Fastest / any" may pick one your plan doesn't include.

**IVPN** — WireGuard or OpenVPN. PF: no.

- WireGuard: private key + address.
- OpenVPN: enter your **account ID** (`i-XXXX-XXXX-XXXX`) as username and leave the password empty.
  Your email + password also work.

**FastestVPN** — WireGuard or OpenVPN. PF: no.

- WireGuard: private key + address. You have to ask FastestVPN's support for the WireGuard file.
- OpenVPN: username + password.

**PrivateVPN** — OpenVPN. PF: **yes, automatic**.

- Your PrivateVPN account login and password — **not** the "Proxy login" in the control panel.

**Perfect Privacy** — OpenVPN. PF: **yes, automatic**.

- Username + password.
- If the VPN connects but nothing works, turn off the "TrackStop" filter for fraud in your account.

**CyberGhost** and **VPN Unlimited** — OpenVPN. PF: no.

- Username + password **plus** a client certificate and a client key, all from the provider's
  manual (OpenVPN) setup. See [Certificates and keys](#certificates-and-keys).

**VPNSecure** — OpenVPN. PF: no.

- No username. You need three things instead:
  - **Client certificate** — usually in the file `yourusername.crt`,
  - **Encrypted client key** — usually in the file `yourusername.key`,
  - **Key passphrase** — your VPNSecure account password.

**ExpressVPN, IPVanish, HideMyAss, Privado, PureVPN, TorGuard, VyprVPN, Giganews, SlickVPN** —
OpenVPN. PF: no.

- Username + password. Check the provider's manual setup page to see whether it uses special
  OpenVPN credentials or your normal login.

## Your provider has WireGuard, but EasyArr only offers OpenVPN?

EasyArr can only use WireGuard with a provider when the VPN software inside EasyArr (Gluetun)
supports it. For some providers — for example PureVPN, TorGuard, CyberGhost, VyprVPN, PrivateVPN and
VPN Unlimited — you can still use a WireGuard file through
[Custom: use a config file](custom.md). The downside: you then use one fixed server, and automatic
port forwarding isn't available (for PrivateVPN it only works over OpenVPN anyway).

## Step 3: Connect and check

Pick a server location (or "Fastest / any"), turn on port forwarding if your provider has it and
you use torrents, then press **Connect**. EasyArr tests the connection and shows whether your home
IP is hidden. If something goes wrong, EasyArr says what it thinks the problem is — most of the time
it's a credential copied from the wrong place.

Your provider not listed at all? Use [Custom: use a config file](custom.md).
