# Send email from a Gmail account

Doable can send its emails (verification codes, password resets, login links, invites) from your own Gmail address. It uses the **Gmail API**, which runs over HTTPS, so it also works on Render's free plan, where normal email sending (SMTP) is blocked.

You need three values: a **client ID**, a **client secret** and a **refresh token**. Getting them takes about 15 minutes and costs nothing. Do every step while signed in to the Gmail account that will send the emails.

## 1. Create a Google Cloud project

1. Open <https://console.cloud.google.com> and accept the terms if asked.
2. At the top, open the project picker, choose **New project**, name it `Doable mail` and click **Create**. Make sure it's selected afterwards.
3. Go to **APIs & Services → Library**, search for **Gmail API**, open it and click **Enable**.

## 2. Set up the consent screen

1. Go to **APIs & Services → OAuth consent screen** (also called **Google Auth Platform**) and click **Get started**.
2. App name: `Doable`. User support email: your Gmail address. Click **Next**.
3. Audience: **External**. Click **Next**.
4. Contact email: your Gmail address. Accept the policy and click **Create**.
5. Open **Audience** and click **Publish app**, then **Confirm**.

   This matters: while the app is in "Testing", Google cancels the refresh token after 7 days and email stops working. Publishing doesn't make anything public. Only you will ever sign in to it.

## 3. Create the client ID and secret

1. Open **Clients** (or **Credentials → Create credentials → OAuth client ID**).
2. Application type: **Web application**. Name: `Doable`.
3. Under **Authorized redirect URIs**, add exactly:
   `https://developers.google.com/oauthplayground`
4. Click **Create**, then copy the **Client ID** and **Client secret**.

## 4. Get the refresh token

1. Open <https://developers.google.com/oauthplayground>.
2. Click the gear icon (top right), tick **Use your own OAuth credentials**, and paste the client ID and secret.
3. On the left, in the box under the API list, type this scope and click **Authorize APIs**:
   `https://www.googleapis.com/auth/gmail.send`
4. Sign in with your Gmail account. Google shows **"Google hasn't verified this app"**. That's expected for your own app: click **Advanced → Go to Doable (unsafe)**, then **Continue**.
5. Back in the playground, click **Exchange authorization code for tokens** and copy the **Refresh token**.

The `gmail.send` permission only lets Doable send email as you. It can't read your inbox.

## 5. Give the values to the app

**On Render:** open your service → **Environment** and set the following, then **Save**. Render restarts the app.

| Key | Value |
|---|---|
| `MAIL_FROM` | `Doable <your-address@gmail.com>`, the same account as above |
| `GMAIL_CLIENT_ID` | from step 3 |
| `GMAIL_CLIENT_SECRET` | from step 3 |
| `GMAIL_REFRESH_TOKEN` | from step 4 |

**On your computer (optional):** put the same four lines in `.env` and run `docker compose up -d backend`. Emails then go to real inboxes instead of Mailpit.

Gmail takes priority: when these are set, Brevo and SMTP aren't used.

## Checking it works

Sign up with an address you can read, or use **Forgot password**, and the email should arrive from your Gmail address within a few seconds. It also shows in your Gmail **Sent** folder.

| Problem | What to do |
|---|---|
| Nothing arrives | In Render **Logs**, search for `Gmail`. The first lines after a restart should say `Emails will be sent through the Gmail API.` |
| `invalid_grant` in the logs | The refresh token was cancelled: the app was still in "Testing" (step 2.5), or you changed your Google password. Publish the app and redo step 4. |
| `invalid_client` | The client ID or secret was pasted wrong. |
| `403` mentioning the Gmail API | The Gmail API isn't enabled (step 1.3). |

A regular Gmail account can send about 500 emails a day, which is plenty for testing.
