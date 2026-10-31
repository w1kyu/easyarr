# Surfshark — set up in EasyArr

_Last checked: 31 October 2026_

Surfshark works well with EasyArr. It has **no port forwarding**, so torrents work but can be a
bit slower. Usenet isn't affected at all. You can connect in two ways: **WireGuard**
(recommended — faster and simpler) or **OpenVPN**. You only need one of them.

## What you need

- An active, paid Surfshark subscription.
- A computer or phone with a web browser.
- For WireGuard: a simple text editor to open a small file (Notepad on Windows, TextEdit on Mac).
- About 5 minutes.

## WireGuard (recommended): get your key and address

WireGuard needs two values: a **private key** (a secret password-like code, 44 characters ending
in `=`) and an **address** (your VPN-internal address, looks like `10.14.0.2/16`).

1. Go to **surfshark.com** and log in to your account.
2. Open **VPN → Manual setup**. (On some screens it's **Products → VPN → Manual setup**.)
3. Choose **Desktop or mobile**, then **WireGuard**.
4. Choose **I don't have a key pair**. Type a name you'll recognise, like `EasyArr`, and continue.
5. Click **Generate a new key pair**. Surfshark now shows a **Public key** and a **Private key**.
6. Copy the **Private key** and keep it somewhere safe, for example in your password manager.
   Surfshark shows it only this once.
7. Click **Choose a location**, pick any location and press **Download**. You get a small file
   ending in `.conf` (for example `de-fra.conf`).
   - Always create the key pair **before** you download. Otherwise the file is missing your key.
   - The location doesn't matter. You pick the server country in EasyArr later.
8. Open the `.conf` file with your text editor. Find the line that starts with `Address`, for
   example `Address = 10.14.0.2/16`. Copy the part that looks like `10.14.0.2/16`.
   - If the line also has a second, longer address after a comma (that's IPv6, a newer kind of
     internet address), you can ignore it. EasyArr only uses the first one.
   - Lost the private key? The same file has it on the `PrivateKey` line.

Your address is the same for every Surfshark server, so you only do this once.

## OpenVPN: get your service credentials

OpenVPN needs a username and password. These are Surfshark **service credentials** — **not** the
email address and password you log in to the website with.

1. Go to **surfshark.com** and log in.
2. Open **VPN → Manual setup → Desktop or mobile → OpenVPN**.
3. Open the **Credentials** tab. If you don't see a username and password yet, click
   **Generate credentials**.
4. Copy the **username** and the **password** (each has a copy icon next to it).

You don't need to download any OpenVPN files. EasyArr already knows Surfshark's servers.

## Fill in EasyArr

1. In the VPN step of the setup (or later in **Settings → VPN**), choose **Surfshark** in the
   **Also works** group.
2. Under **Connection type**, choose **WireGuard** or **OpenVPN** — the same one you prepared
   above.
3. Fill in the fields:

| Connection type | EasyArr field             | What to paste                                        |
| --------------- | ------------------------- | ---------------------------------------------------- |
| WireGuard       | **WireGuard private key** | The **Private key** from step 6 (ends in `=`)        |
| WireGuard       | **WireGuard address**     | The address from the `Address` line, e.g. `10.14.0.2/16` |
| OpenVPN         | **VPN username**          | The service **username** from the Credentials tab    |
| OpenVPN         | **VPN password**          | The service **password** from the Credentials tab    |

4. **Server country** (optional): pick a country close to you for the best speed, or leave it on
   **Fastest / any**.
5. Press **Connect**. EasyArr tests the connection. You should see **Connected to Surfshark** and
   **Your home IP is hidden**.

There's no port forwarding switch for Surfshark, because Surfshark doesn't offer it. That's
expected.

## If the test fails

- **"The key isn't right" or "Couldn't reach the VPN server" (WireGuard):** you probably copied
  the **Public key** instead of the **Private key**, or missed a character. Copy the private key
  again (44 characters, ending in `=`). Lost it? Make a new key pair (steps 4–8) and use the new
  file.
- **"Username or password was refused" (OpenVPN):** you used your website email and password.
  Use the service credentials from the **Credentials** tab instead. Also check that your
  subscription is still active.
- **"Enter an IPv4 address like …":** the address field only got the long IPv6 part, or the whole
  file. Paste just the part like `10.14.0.2/16` from the `Address` line.
- **"No server matches your choice":** choose **Fastest / any** or another country and press
  **Connect** again.

Back to [VPN basics](README.md).
