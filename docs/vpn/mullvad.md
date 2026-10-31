# Mullvad — set up in EasyArr

_Last checked: 31 October 2026_

Mullvad is in the **Also works** group. It is safe and simple, but it has **no port forwarding**
(Mullvad removed it in 2023). Torrents still work, just slower. For Usenet that makes no
difference.

## What you need

- A Mullvad account with time on it (Mullvad has no free plan). Your login is a 16-digit
  **account number** — there is no email or password.
- A free **device slot**: Mullvad allows **5 devices** per account, and EasyArr counts as one.
  If all 5 are used, remove an old one on the **Devices** page of your Mullvad account first.
- A web browser to sign in at [mullvad.net](https://mullvad.net/en/account/login).

Mullvad only supports **WireGuard** (a modern, fast way to connect to a VPN). It switched off
OpenVPN on 15 January 2026, so EasyArr only offers WireGuard for Mullvad.

## Get your key and address

You need two values from one small file: a **private key** (a secret code of 44 characters ending
with `=`) and an **address** (looks like `10.64.123.45/32`).

1. Open Mullvad's [WireGuard configuration generator](https://mullvad.net/en/account/wireguard-config).
2. Log in by entering your Mullvad **account number**.
3. Under **Platform**, pick any option (for example **Linux** or **Router**). It doesn't matter for
   EasyArr.
4. Click **Generate key**. This creates a new key just for EasyArr and uses one device slot.
5. Pick any country, city or server. EasyArr chooses its own server later — the key works for all
   of them.
6. Leave everything else as it is. Click **Download file** and wait a few seconds.
7. Open the downloaded file with a text editor (Notepad, TextEdit…). If you got a `.zip` file,
   open it first and pick any one file inside.
8. Find these two lines near the top:
   - `PrivateKey = …` — copy everything after `PrivateKey = `.
   - `Address = …` — copy only the **first** part, before the comma. It looks like
     `10.64.123.45/32`.

The `Address` line usually also has a second, longer address with colons (`fc00:…`). That's
IPv6, a newer kind of address. EasyArr doesn't use it, so you can leave it out — or paste the
whole line, EasyArr ignores the IPv6 part.

Keep the file private: anyone who has the key can use your Mullvad account.

**Don't** use the "WireGuard key" shown on Mullvad's **Devices** page. That is the public half of
the key and won't work.

## Fill in EasyArr

1. In the VPN step, pick **Mullvad** (group **Also works**).
2. **Connection type** is WireGuard — there is nothing else to choose.
3. Fill in the fields:

| EasyArr field         | What to paste                                                  |
| --------------------- | -------------------------------------------------------------- |
| WireGuard private key | The text after `PrivateKey = ` from your file                  |
| WireGuard address     | The first address from the `Address` line, e.g. `10.64.123.45/32` |

4. **Server country** (optional): leave **Fastest / any** unless you want a specific country.
5. Press **Connect** and wait for the test.

The key and address belong together. If you generate a new key, copy the new address too.

## If the test fails

- **"The key isn't right" or "Couldn't reach the VPN server":** copy the key again — all 44
  characters, with the `=` at the end and no spaces. Make sure key and address come from the
  **same** file.
- **The device was removed:** if you (or Mullvad, when you hit the 5-device limit) removed this
  device on the **Devices** page, its key stops working. Generate a new key and paste both new
  values.
- **No time left on the account:** check your account page. Mullvad stops connecting as soon as
  the paid time runs out.
- **"Enter an IPv4 address like 10.64.222.21/32":** you pasted only the IPv6 part. Use the part
  that starts with `10.`.

Back to [VPN basics](README.md).
