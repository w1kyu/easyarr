# Usenet 101

Usenet is one of two ways EasyArr can download things. The other one is
[torrents](torrents-101.md). You can use both.

## How Usenet works

Usenet is a very old network of servers (from 1980) that store posted files. You don't share
anything with other people — you simply download from a server, like from a normal website.

To use it you need two things:

1. **A Usenet provider** (paid). That's the server you download from. You get a username,
   a password and a server address. Prices are usually a few euros/dollars per month.
2. **An indexer** (often free or a small yearly fee). That's a search engine that tells EasyArr
   *what* to download from the provider. You get a website address and an **API key**.

SABnzbd is the app in EasyArr that does the actual downloading. You enter both in the setup
(step 6), and EasyArr connects everything for you.

## Setting it up in EasyArr

### Your provider

1. Pick your provider from the list. EasyArr fills in the **server address**, the **port** and
   the number of **connections** for you. (The list just saves typing — it isn't a
   recommendation.) Not in the list? Choose *Other provider* and copy the server address from
   your provider's website (look for "setup", "server settings" or "newsreader").
2. Enter the **username** and **password** of your provider account. Some providers use your
   e-mail address as the username, others give you a separate one — the provider's welcome
   e-mail says which.
3. Keep **SSL** on. It encrypts the connection, so your internet provider can't see what you
   download. The SSL port is almost always **563**.
4. **Connections** is how many parts SABnzbd downloads at the same time. Use what your plan
   allows (the preset does). Too many and the provider refuses you; fewer is just slower.
5. Press **Test this provider**. "It works" means SABnzbd could sign in.

Got a second provider as a backup (a "block account")? Press **Add another provider**.
SABnzbd uses it when the first one is missing something.

### Your indexer

1. Pick your indexer from the list (it comes from Prowlarr) or choose *Other indexer* and enter
   its address, for example `https://indexer.example`.
2. Copy your **API key** from the indexer's website. It's usually on your profile page or a page
   called "API" or "RSS". It's a long code that lets EasyArr search on your behalf.
3. Press **Test this indexer**.

You can add several indexers — more indexers find more.

### Tests fail?

| What EasyArr says | What to do |
| --- | --- |
| The username, password or API key was refused | Copy it again from your account. Watch out for spaces at the start or end. |
| Couldn't reach this address | Check the server address for typos. Only the name, like `news.example.com` — no `https://`. |
| No answer in time | Check the port (563 with SSL). Some providers also offer 443. |
| Your VPN isn't connected | Tests and downloads go through the VPN. Set it up in step 5 first. |

Passwords and API keys are stored only on your Umbrel. EasyArr never shows them again — leave
the field empty to keep the saved one.

## Pros and cons

| 👍 Good                                             | 👎 Not so good                                 |
| --------------------------------------------------- | ---------------------------------------------- |
| Very fast — often as fast as your internet line     | Costs money (provider)                         |
| You don't share anything with others                | You need two accounts (provider + indexer)     |
| Your IP address isn't visible to other people       | Very old or rare things may be missing          |
| Reliable: no waiting for other people to come online | A little more to set up at the start          |

## Torrents or Usenet?

- **Just trying things out?** Start with **torrents**. They cost nothing.
- **Want fast and reliable downloads, and don't mind paying a little?** Choose **Usenet**.
- **Want the best of both?** Choose **both**. EasyArr then searches both and takes whichever
  has what you asked for.

You can change your choice later in Settings.

## Be responsible

Only download content you have the right to download. Laws differ between countries — you are
responsible for following yours.
