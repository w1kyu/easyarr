# AirVPN — set up in EasyArr

_Last checked: 31 October 2026_

AirVPN is in EasyArr's **Best for torrents** group. Its port forwarding works a little
differently: you **reserve a port once** in your AirVPN account and type it into EasyArr. EasyArr
then sets it in qBittorrent for you. You can connect with **WireGuard** (recommended — faster and
simpler) or **OpenVPN**. You only need one of them.

## What you need

- An active, paid AirVPN subscription.
- A computer with a web browser and a simple text editor (Notepad on Windows, TextEdit on Mac).
- About 10 minutes.

All steps below happen on **airvpn.org** after you **Sign In**, in the **Client Area** (top menu).

## Step 1: Create a "device" for EasyArr (recommended)

AirVPN calls each set of keys a **device**. Giving EasyArr its own device avoids clashes with your
computer or phone: two connections with the same key can't use the same AirVPN server at once.

1. Open **Client Area → Devices**.
2. Click **Add a new device**. Give it a name you'll recognise, like `EasyArr` (click the pencil
   icon to edit the name).

## Step 2a: WireGuard values (recommended)

1. Open **Client Area → Config Generator**.
2. As the operating system, choose **Linux** (that's what EasyArr runs on).
3. Under the protocols, tick a **WireGuard** entry.
4. Choose your **EasyArr** device.
5. Pick any one server or country. It doesn't matter — you choose the server country in EasyArr.
6. Accept the Terms of Service and click **Generate**. Download the `.conf` file.
7. Open the file with your text editor. You need three lines:

| Line in the file                   | What it is                                 |
| ---------------------------------- | ------------------------------------------ |
| `PrivateKey = …` (near the top)    | Your private key (44 characters, ends in `=`) |
| `PresharedKey = …` (further down)  | An extra shared secret (also ends in `=`)  |
| `Address = 10.x.x.x/32, …`         | Your VPN-internal address                  |

Don't use the `PublicKey` line — that belongs to the AirVPN server. On the `Address` line, you
only need the first part, like `10.128.45.67/32`. The longer part after the comma is IPv6 (a newer
kind of internet address); EasyArr ignores it.

## Step 2b: OpenVPN values

1. Open **Client Area → Config Generator**.
2. Choose **Linux**, tick an **OpenVPN** entry (UDP is fine), and choose your **EasyArr** device.
3. Pick any one server or country, accept the Terms of Service and click **Generate**. Download
   the `.ovpn` file. Leave the advanced options as they are.
4. Open the file with your text editor. It contains several blocks. Ignore the `<ca>` and
   `<tls-crypt>` blocks. You need two:
   - everything between `<cert>` and `</cert>` — your **client certificate**,
   - everything between `<key>` and `</key>` — your **client key**.

## Step 3: Reserve a port (for torrents)

1. Open **Client Area → Ports** (the page is called **Forwarded ports**).
2. Add a new port. Leave the port number empty to let AirVPN pick a free one, or type one
   (AirVPN uses ports from 2048 upwards).
3. Choose **TCP & UDP**. Leave the **Local** field **empty** — torrent ports must not be mapped
   to a different number.
4. Under **Device**, choose **All Devices** or your **EasyArr** device. If you choose a device,
   it must be the same one you generated the file with, or the port won't reach EasyArr.
5. Save it and write down the port number.

The port stays yours as long as your subscription is active. Don't also open this port on your
home router — AirVPN warns that this can leak traffic outside the VPN. Only use Usenet? You can
skip this step.

## Fill in EasyArr

1. In the VPN step of the setup (or later in **Settings → VPN**), choose **AirVPN** in the **Best
   for torrents** group.
2. Under **Connection type**, choose **WireGuard** or **OpenVPN** — the same one you prepared.
3. Fill in the fields:

| Connection type | EasyArr field               | What to paste                                   |
| --------------- | --------------------------- | ----------------------------------------------- |
| WireGuard       | **WireGuard private key**   | The value after `PrivateKey =`                  |
| WireGuard       | **WireGuard preshared key** | The value after `PresharedKey =`                |
| WireGuard       | **WireGuard address**       | The first part of the `Address` line, e.g. `10.128.45.67/32` |
| OpenVPN         | **Client certificate**      | The text between `<cert>` and `</cert>`         |
| OpenVPN         | **Client key**              | The text between `<key>` and `</key>`           |

4. Turn **Port forwarding** on and type your port into **Your reserved port** (EasyArr accepts
   1024–65535).
5. **Server country** (optional): pick one close to you, or leave **Fastest / any**.
6. Press **Connect**. You should see **Connected to AirVPN**, **Your home IP is hidden** and
   **Port forwarding is on (port …)**.

## If the test fails

- **"The key isn't right" or "Couldn't reach the VPN server" (WireGuard):** a key was pasted into
  the wrong field (private and preshared mixed up, or the server's `PublicKey` used). Also, if you
  renewed or deleted the device under **Devices**, its old keys stop working — generate a new file.
- **"The certificate or key wasn't accepted" (OpenVPN):** you probably copied the `<ca>` or
  `<tls-crypt>` block. Copy the `<cert>` and `<key>` blocks again from a freshly generated file.
- **Connected, but torrents stay slow:** check the port on the **Forwarded ports** page — same
  number as in EasyArr, **Local** empty, and **Device** set to **All Devices** or your EasyArr
  device.
- **Connection drops when your computer uses AirVPN too:** both use the same device. Create a
  separate EasyArr device (Step 1) and generate new values with it.

Back to [VPN basics](README.md).
