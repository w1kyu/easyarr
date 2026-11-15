# Family accounts

The account you create in the setup is **your** account. It's the admin account for:

- **Jellyfin**, where you watch movies, shows and music;
- **Jellyseerr**, the request page (it signs you in with your Jellyfin account).

The other apps inside EasyArr don't have logins of their own. Your Umbrel login protects them.

Everyone in your home can get their own Jellyfin account. Then everybody has their own "continue
watching" list, and you choose what each person may watch and request.

> **What you'll need**
>
> - EasyArr set up and finished (the setup's last step is done).
> - About 5 minutes per person.

## 1. Create an account in Jellyfin

1. On the EasyArr home screen, press **Watch** and sign in with your own account.
2. Click your profile picture at the top right, then **Dashboard**.
3. In the menu on the left, click **Users**.
4. Click the **+** button (**Add User**).
5. Type a **Name** and a **Password** for the new person.
6. Under **Library Access**, leave **Enable access to all libraries** ticked, or untick it and
   choose the libraries this person may see (for example only **Movies**).
7. Click **Save**.

The new person can now sign in to Jellyfin with that name and password, on the TV, phone or in the
browser.

### Limit what children can watch (optional)

1. In **Dashboard → Users**, click the person.
2. Open the **Parental Control** tab.
3. Choose a **Maximum allowed parental rating**, for example the rating for 12-year-olds in your
   country.
4. Click **Save**.

Movies and shows above that rating are hidden for this person. It works best when your library has
ratings, which Jellyfin adds by itself for most movies and shows.

## 2. Let them request movies and shows

Everyone with a Jellyfin account can sign in to the request page and ask for movies and shows
right away. Your own requests start downloading at once. Requests from other people wait until you
approve them: you see them under **Requests**, with **Approve** and **Decline** buttons. If you
trust someone, give them **Auto-Approve** (below) and their requests start at once too.

To see or change what someone may do:

1. On the EasyArr home screen, press **Request** and sign in with your own account.
2. Click **Users** in the menu on the left. People appear here after they sign in for the first
   time. To add everyone at once, click **Import Jellyfin Users**.
3. Click **Edit** next to a person.
4. Under **Permissions**, choose what they may do. The most useful ones:
   - **Request**: may ask for movies and shows.
   - **Auto-Approve**: their requests start downloading without your OK.
5. Click **Save Changes**.

To change the starting permissions for everyone who signs in later, go to **Settings → Users →
Default Permissions** on the request page.

## Change a password

- **Your own password:** in Jellyfin, click your profile picture → **Profile**, and change it under
  **Password**. Changing it from EasyArr's Settings comes in a later version.
- **Someone else's password:** in Jellyfin, go to **Dashboard → Users**, click the person, open the
  **Password** tab, type a **New password** and click **Save Password**.

The request page always uses the Jellyfin password, so you only change it in one place.

## Remove an account

In Jellyfin, go to **Dashboard → Users**, click the **⋯** menu next to the person and choose
**Delete**. Their requests on the request page stay until you delete them there too (**Users →
Delete User**).
