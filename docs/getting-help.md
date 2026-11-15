# Getting help

Something doesn't work? There are three ways to get help, from fastest to slowest:

1. Look for your problem in [Troubleshooting](troubleshooting.md).
2. Ask an AI chat (ChatGPT, Claude, Gemini, …) with **Get help with AI**.
3. Open an issue on GitHub.

## Get help with AI

EasyArr can write the question for you. It describes your setup, what went wrong and the newest
lines from the apps' logs, so the AI can give an answer that fits your Umbrel.

1. Press **Get help with AI**. You find it:
   - next to every error in the setup wizard,
   - on the Finish step when connecting the apps didn't work,
   - in **Help**, at the top right of every EasyArr page,
   - next to problems on the home screen.
2. Type in a few words under **What I was trying to do**, for example "Download a movie" or
   "Connect the VPN".
3. Read the preview. That is exactly what gets copied, nothing else.
4. Press **Copy**, or one of the chat buttons (ChatGPT, Claude, Gemini, Le Chat): they copy the
   text and open that chat in a new tab.
5. Paste it into the chat (Ctrl+V, or ⌘+V on a Mac) and send it.

The AI may ask you to try something. If it suggests terminal commands, ask it for a way that works
from the EasyArr dashboard: EasyArr is built so you never need a terminal.

### What EasyArr hides before you copy

Before anything leaves EasyArr, these are replaced with `[REDACTED:…]`:

- passwords, API keys, tokens and VPN keys (`[REDACTED:password]`, `[REDACTED:apikey]`,
  `[REDACTED:key]`, `[REDACTED:token]`),
- usernames and e-mail addresses,
- your public IP address (`[REDACTED:ip]`),
- the names of your Usenet servers, VPN servers and search sites (`[REDACTED:host]`).

Addresses inside your home network (like `192.168.1.20`) stay visible, because they often help to
find a problem and don't identify you on the internet. Tick **Also hide addresses in my home
network** if you want them hidden too.

If EasyArr ever finds one of your passwords or keys still in the text, it refuses to show the
preview instead of risking it. Please [report that](#open-an-issue-on-github).

## Download diagnostics

The diagnostics file is a `.zip` with the same information in more detail. It's useful for a
GitHub issue or for someone who helps you.

1. Open **Help** (top right) and press **Download diagnostics** (also in the **Get help with AI** window).
2. The file is called something like `easyarr-diagnostics-2026-11-15-1030.zip`.

Inside are:

| File | What it says |
|---|---|
| `diagnostics.json` | EasyArr version, hardware, your setup choices, which apps answer, the VPN's state (no IP addresses) |
| `ai-prompt.txt` | The same text as **Get help with AI** |
| `logs/` | The newest lines from EasyArr, the VPN and each app's log |
| `README.txt` | What the file is and what was hidden |

The same things are hidden as in the AI prompt. It's still a good idea to open the zip and have a
look before you share it.

## Open an issue on GitHub

If neither the docs nor an AI could help, or you think you found a bug:

1. Go to [github.com/w1kyu/easyarr/issues](https://github.com/w1kyu/easyarr/issues) and press
   **New issue**. You need a free GitHub account.
2. Pick **Bug report**, **Feature request** or **VPN guide is outdated**.
3. Fill in the form. For a bug, attach the diagnostics zip or paste the AI prompt from the preview.

Never paste a password or key into an issue: issues are public. If you did by accident, change
that password right away.

Found a security problem? Don't open a public issue. See
[SECURITY.md](https://github.com/w1kyu/easyarr/blob/main/SECURITY.md) for how to report it
privately.
