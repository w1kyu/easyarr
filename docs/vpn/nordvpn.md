# NordVPN — set up in EasyArr

_Last checked: 31 October 2026_

NordVPN is in the **Also works** group. It is safe and fast, but it has **no port forwarding**.
Torrents still work, just slower. For Usenet that makes no difference.

## What you need

- An active NordVPN subscription (any plan).
- Access to the email address of your Nord Account: Nord sends you a **verification code** before
  it shows the manual setup details.
- A web browser to sign in at [my.nordaccount.com](https://my.nordaccount.com/).

**WireGuard** and **OpenVPN** are two ways of connecting to a VPN. WireGuard is newer and faster,
so EasyArr recommends it. NordVPN calls its WireGuard version **NordLynx**.

## Option A: WireGuard (recommended)

You need one value: a **private key**. It is a secret code of 44 characters that ends with `=`.
NordVPN puts it into a WireGuard file you can download.

1. Sign in at [my.nordaccount.com](https://my.nordaccount.com/) and click **NordVPN**.
2. Scroll down to **Advanced settings** and click **Set up NordVPN manually**.
3. If asked, click **Verify email** and enter the code Nord sends you.
4. Open the **Server recommendation** tab. Take the recommended server or pick any other one —
   EasyArr chooses its own server later. If you can, pick one with a **Verified** badge.
5. Click **Get setup configuration** (on some pages: **WireGuard** under **Available protocols**).
6. Choose **WireGuard** and click **Download config**. You get a file ending in `.conf`.
7. Open the file with a text editor (Notepad, TextEdit…).
8. Find the line that starts with `PrivateKey =`. Copy everything **after** `PrivateKey = `. That
   is your WireGuard private key.

You don't need the other lines. EasyArr already knows NordVPN's servers and its standard address
(`10.5.0.2/32`).

Keep this file private: anyone who has the key can use your NordVPN account.

## Option B: OpenVPN

You need a **VPN username** and **VPN password**. NordVPN calls them **service credentials**.
They are **not** your Nord Account email and password.

1. Sign in at [my.nordaccount.com](https://my.nordaccount.com/) and click **NordVPN**.
2. Scroll down to **Advanced settings** and click **Set up NordVPN manually**.
3. Open the **Service credentials** tab.
4. Click **Verify email** and enter the code Nord sends you.
5. Copy the **Username** and the **Password** with the **Copy** buttons next to them.

You do **not** need to download any OpenVPN files — EasyArr already knows NordVPN's servers.

## Fill in EasyArr

1. In the VPN step, pick **NordVPN** (group **Also works**).
2. **Connection type:** choose **WireGuard** (if you did Option A) or **OpenVPN** (Option B).
3. Fill in the fields:

| EasyArr field         | What to paste                                                       |
| --------------------- | ------------------------------------------------------------------- |
| WireGuard private key | WireGuard only: the text after `PrivateKey = ` from your `.conf` file |
| VPN username          | OpenVPN only: the service credentials **Username**                  |
| VPN password          | OpenVPN only: the service credentials **Password**                  |

4. **Server country** (optional): leave **Fastest / any** unless you want a specific country.
5. Press **Connect** and wait for the test.

## If the test fails

- **"The key isn't right" or "Couldn't reach the VPN server" (WireGuard):** copy the key again —
  all 44 characters, with the `=` at the end and no spaces. Still failing? Download a fresh
  WireGuard file from the **Set up NordVPN manually** page and use its key.
- **"Username or password was refused" (OpenVPN):** you probably used your Nord Account email and
  password. Use the **service credentials** instead. Copy them with the **Copy** buttons so no
  space sneaks in.
- **Subscription ended:** check in your Nord Account that your NordVPN plan is still active.
- **"No server matches your choice":** choose **Fastest / any** as server country, or try another
  country.

Back to [VPN basics](README.md).
