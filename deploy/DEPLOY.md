# Deploying Doable on Oracle Cloud (free)

This puts the whole app on one free Oracle Cloud server, with HTTPS, using the same Docker setup you run locally. Plan on about an hour the first time.

You'll end up with:

- the app at `https://<your-address>`, always on
- a free HTTPS certificate that renews itself
- only ports 80 and 443 open to the internet; the database is never reachable from outside
- daily database backups and one command to deploy updates

## 1. Create an Oracle Cloud account

1. Sign up at <https://www.oracle.com/cloud/free/>. It asks for a credit card to check you're a real person; Always Free resources are not charged.
2. Pick your **home region** carefully: it can't be changed, and the free Arm servers are only in your home region. Choose one near your users. If a popular region is full (see step 2), a less busy one nearby is easier.

## 2. Create the server

In the Oracle Cloud console: **Compute → Instances → Create instance**.

| Setting | Choose |
|---|---|
| Name | `doable` |
| Image | **Canonical Ubuntu 24.04** (not "Minimal") |
| Shape | **Ampere → VM.Standard.A1.Flex**, 2 OCPUs, 12 GB memory (check it says "Always Free-eligible") |
| Networking | Create a new virtual cloud network and public subnet; **Assign a public IPv4 address**: yes |
| SSH keys | **Generate a key pair for me**, then **Save private key** (keep this file safe; it's the only way in) |
| Boot volume | Default (about 47 GB) is fine; up to 200 GB is free |

Click **Create**. If you see **"Out of capacity"**, the free Arm servers in your region are all taken right now. Try another availability domain (AD-2, AD-3) in the same form, or try again at a different time of day. It can take a few attempts.

When it's running, copy the **Public IP address** from the instance page.

## 3. Open ports 80 and 443 in Oracle's firewall

On the instance page: click the **subnet** → **Security Lists** → the default security list → **Add Ingress Rules**. Add two rules:

| Source CIDR | IP Protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(Port 22 for SSH is already open.)

## 4. Log in and set up the server

From your PC (PowerShell; `ssh` is built into Windows):

```powershell
ssh -i C:\path\to\ssh-key-2026-10-13.key ubuntu@YOUR_PUBLIC_IP
```

If Windows complains that the key's permissions are too open, run this once and retry:

```powershell
icacls C:\path\to\ssh-key-2026-10-13.key /inheritance:r /grant:r "$($env:USERNAME):R"
```

On the server:

```bash
git clone https://github.com/medmouheb/todoist.git doable
cd doable
bash deploy/server-setup.sh
exit
```

The script installs Docker, opens ports 80/443 in Ubuntu's own firewall (Oracle's Ubuntu images block them even after step 3), adds swap and turns on automatic security updates. Logging out and back in lets your user run Docker.

## 5. Choose the address

**No domain?** Use your public IP with [sslip.io](https://sslip.io), which needs no sign-up. Replace the dots with dashes: IP `129.151.10.20` becomes `129-151-10-20.sslip.io`.

**Have a domain?** Add a DNS **A record** pointing to the public IP (for example `todo.yourname.com → 129.151.10.20`) and wait until it resolves (`nslookup todo.yourname.com`).

## 6. Set up email (optional, recommended)

Password resets, login links and invites need an email service. [Brevo](https://www.brevo.com) has a free plan with 300 emails a day:

1. Sign up, then go to **Senders, domains & dedicated IPs** and add and verify the address you'll send from.
2. Go to **SMTP & API → SMTP** and copy the **login** and create an **SMTP key**.

Skip this and the app still works; those emails are just not sent (the backend log says so).

## 7. Configure and start

Log back in (`ssh -i ... ubuntu@YOUR_PUBLIC_IP`), then:

```bash
cd doable
cp .env.prod.example .env.prod
openssl rand -base64 24   # copy this: database password
openssl rand -base64 48   # copy this: JWT secret
nano .env.prod
```

Fill in `DOMAIN`, `POSTGRES_PASSWORD`, `JWT_SECRET`, and (if you did step 6) `MAIL_USERNAME`, `MAIL_PASSWORD` and `MAIL_FROM`. Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

```bash
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build
```

The first build takes 5–10 minutes. Then open `https://YOUR_DOMAIN` and sign up. The first visit can take a few seconds while the certificate is issued.

Check that everything is running:

```bash
docker compose -f compose.prod.yaml --env-file .env.prod ps
docker compose -f compose.prod.yaml --env-file .env.prod logs -f backend   # Ctrl+C to stop watching
```

## 8. Turn on daily backups

```bash
crontab -e
```

Add this line (backs up at 03:00 every day and keeps the newest 14):

```
0 3 * * * cd $HOME/doable && bash deploy/backup.sh >> backups/backup.log 2>&1
```

Backups stay on the server. Now and then, copy one to your PC from PowerShell:

```powershell
scp -i C:\path\to\key ubuntu@YOUR_PUBLIC_IP:doable/backups/doable-*.sql.gz .
```

## Updating the app

Push your changes to GitHub from your PC, then on the server:

```bash
cd doable && bash deploy/update.sh
```

It backs up the database, pulls the code, rebuilds and restarts. Database changes run automatically (Flyway migrations).

## If something goes wrong

| Problem | Check |
|---|---|
| Browser can't reach the site | Step 3 rules exist; `sudo iptables -L INPUT -n --line-numbers` shows ACCEPT for 80 and 443 above the REJECT line; `docker compose ... ps` shows `caddy` running |
| Certificate error | `docker compose ... logs caddy`. The domain must point to this server and ports 80 and 443 must be reachable from the internet |
| "Out of capacity" when creating the server | Another availability domain, or retry later |
| Emails don't arrive | `docker compose ... logs backend \| grep -i mail`; check the sender is verified with Brevo |
| Need to look at the database | `docker compose -f compose.prod.yaml --env-file .env.prod exec db psql -U doable doable` |
| Restore a backup | See the top of `deploy/backup.sh` |

## Keep in mind

- **Oracle may reclaim idle free servers.** Oracle has said it can reclaim Always Free instances that sit nearly idle (very low CPU, network and memory use) for a week. An app people use is normally fine, but keep your own backup copies.
- **The repository is public.** Never commit `.env.prod`; it's already in `.gitignore`.
- **Account security.** Turn on two-factor authentication for your Oracle account, and keep the SSH key file private.
