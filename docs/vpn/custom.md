# Custom: use a config file

_Last checked: 31 October 2026_

Your VPN provider isn't in EasyArr's list? Almost every provider lets you download a **config file**
for "manual setup". EasyArr can use that file directly. Choose **Other / config file** (under
"Custom") in the provider list.

This also works if you run your own VPN server, or if your provider is in the list but EasyArr
only offers OpenVPN for it and you'd rather use WireGuard (see [Other providers](generic.md)).

## Before you start

- Log in on your provider's website and find the **manual setup** page (sometimes called "Router",
  "Linux", "Other devices", "OpenVPN" or "WireGuard").
- Download **one** config file. Prefer **WireGuard** (`.conf`) if offered: it's faster and simpler
  (see [VPN basics](README.md)). Otherwise take **OpenVPN** (`.ovpn`).
- A config file connects to **one server**. If you want another country, download the file for
  that server and save it in EasyArr again.

## WireGuard (.conf)

Paste the whole file into **WireGuard file (.conf)**, or press **Choose a file instead** and pick
it. Then press **Connect**.

The file must contain these lines. EasyArr checks them when you save:

| Section       | Line           | What it is                         |
| ------------- | -------------- | ---------------------------------- |
| `[Interface]` | `PrivateKey`   | Your personal key (keep it secret) |
| `[Interface]` | `Address`      | Your address inside the VPN        |
| `[Peer]`      | `PublicKey`    | The server's key                   |
| `[Peer]`      | `Endpoint`     | The server's address and port      |
| `[Peer]`      | `PresharedKey` | Optional — used if it's there      |

Good to know:

- **IPv6 is ignored.** EasyArr's VPN uses IPv4 only. If `Address` lists an IPv4 and an IPv6
  address, only the IPv4 one is used. If the file has no IPv4 address at all, it won't work.
- **Only the first `[Peer]` is used.** Lines like `DNS`, `AllowedIPs` or `MTU` are ignored —
  EasyArr sends all download traffic through the VPN anyway.
- **Server names are looked up once.** If `Endpoint` is a name (like `nl1.example.com:51820`)
  rather than numbers, EasyArr looks up its IP address **once, when you save**. If the provider
  later moves that server to a new IP address, the VPN stops connecting (the kill switch keeps you
  safe — downloads just stop). Fix: open **Settings → VPN** and save again.
- If EasyArr says "The server name in your file couldn't be found", check your Umbrel's internet
  connection, or download a file that has an IP address in `Endpoint`.

## OpenVPN (.ovpn)

Paste the whole file into **OpenVPN file (.ovpn)**, or press **Choose a file instead** and pick
it.

If your provider needs a login for OpenVPN (the file then usually contains a line
`auth-user-pass`), also fill in **VPN username** and **VPN password**. Many providers use special
"service credentials" for this, not your website login — check the manual setup page. If your
provider needs no login, leave both empty.

Then press **Connect**.

### Limits of OpenVPN files

The VPN software inside EasyArr (Gluetun) reads your file and changes a few things. Most files work
as they are, but check these points if the connection fails:

- **Server names are looked up once, when you save.** Gluetun needs an IP address in the `remote`
  line, because the kill switch blocks name lookups before the VPN is up. If your file has a name
  (like `remote nl1.example.com 1194`), EasyArr replaces it with that server's current IP address
  when you press Connect. If the provider later moves the server, press Connect again (or download a
  file "with IP addresses", if your provider offers one).
- **Only the first `remote` line is used.** Files with a list of backup servers just use the first
  one.
- **Everything must be inside the one file.** EasyArr only stores this one file. Lines that point
  to other files — like `ca ca.crt`, `cert client.crt` or `auth-user-pass login.txt` — won't work.
  Most providers offer "all-in-one" (inline) files, where certificates are inside blocks like
  `<ca>…</ca>`. Use those. Usernames and passwords go into EasyArr's fields, not into a file.
- **Some options are replaced.** Gluetun sets its own values for things like the login handling
  (`auth-user-pass`), the network device (`dev`) and logging (`verb`). You don't need to change
  anything for this.
- **No scripts.** Lines starting with `up` or `down` point to script files that don't exist on
  your Umbrel, so the connection fails. Delete those lines, or download the provider's file for
  "router" or "other devices", which usually has none.

## Port forwarding

Automatic port forwarding (where EasyArr asks the provider for a port) isn't possible with a config
file. What works: a **fixed port** your provider gave you — for example one you reserved in your
account, or one that comes with a static IP address.

1. Turn on **Port forwarding**.
2. Enter the port in **Your reserved port** (1024–65535).
3. Press **Connect**.

EasyArr lets incoming connections on that port through the VPN and sets it in qBittorrent for you.
No fixed port? Leave port forwarding off. Torrents still work, just slower — and Usenet doesn't need
it at all (see [VPN basics](README.md#port-forwarding-in-plain-words)).

## Where your file is stored

Your config file contains secrets (keys, sometimes passwords). EasyArr stores it **only on your
Umbrel**, in files only EasyArr can read. It's never sent anywhere else and never shown again in
the browser. To change it, paste or choose a new file and save. If you switch to a provider from
the list, the old OpenVPN file is deleted.

## Still not connecting?

- Download a fresh file from your provider — files can expire, and keys can be revoked.
- Try a different server's file.
- Check that your subscription is active.
- Open **Technical details** under the error message. It usually names the line or setting that
  failed.
