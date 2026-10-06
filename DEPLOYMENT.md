# Render deployment

The application is prepared for one Render Node web service with one persistent disk. It has a public gallery and an authenticated owner workspace. It is not deployed yet.

## Owner access

Local owner credentials are in `Owner-Access.txt`, excluded from Git. Use the generated website password, not an email-account password. The email is an account identifier; this does not use Google sign-in.

The server stores a salted scrypt password hash, issues an HttpOnly session cookie, verifies request origin and a session CSRF token on writes, rate-limits login attempts, and rejects stale saves. Sessions expire after eight hours and are cleared on server restart. There is no public registration or email password-reset service.

Reset a forgotten password with `node scripts/setup-owner.mjs your-email@example.com --rotate` locally. Copy the new `OWNER_PASSWORD_HASH` into Render's secret environment setting and restart the service. Restart after a local rotation too. Never share the plaintext password or `.env` through Git.

## Provision

1. Put the application code in your Git repository. `.gitignore` excludes credentials, photos, catalogs, OCR, valuations, backups, and the deployment archive. Review the staged files before pushing.
2. In Render, create a Blueprint from that repository using `render.yaml`. It specifies a paid Starter web service and a 1 GB persistent disk. Confirm the current charges in Render before creating the service.
3. Set `APP_ORIGIN` to the exact HTTPS Render URL, with no trailing slash. Set `OWNER_EMAIL` to the owner email and `OWNER_PASSWORD_HASH` to the hash from local `.env`. Paste the hash as a literal value in Render's environment editor, not a shell command. No plaintext password is needed on Render.
4. Render runs `npm ci` and `npm start`. `DATA_DIR=/var/data/gengar` keeps changes on the disk. The production server listens on `0.0.0.0:$PORT`, behind Render's HTTPS endpoint. `/healthz` is a process health check; it does not establish that data have been imported.

## Transfer collection data

Run `python scripts/package-deployment.py` to create `deployment-data/gengar-data.tar.gz` and a SHA-256 manifest. It contains photo previews, label crops, catalog JSON and review overrides. Originals remain on your computer and Drive. The private catalog includes notes and valuations; transfer the archive privately.

Use the SSH connection details provided by your Render service to copy this archive with SCP/SFTP to its persistent disk. In Render's service shell, create `/var/data/gengar` and extract the archive there. Do this only for the initial empty installation; never extract a stale local archive over live edits. Use the included manifest to verify transferred file hashes. SSH/SCP account and host values must come from your Render service; they cannot be supplied until it exists.

## Launch verification

- Anonymous `/api/catalog` requests and writes must return 401. `/admin` must redirect to login.
- Confirm owner login, one estimate with multiple sold links, save, reload, and logout on the actual HTTPS site.
- Confirm front/back photos load and public searches and filters work on mobile.
- Public data includes ready records only. It omits financial values, personal notes, source links, OCR, and explicit cert fields. Certification numbers remain visible in slab photographs.
- Back up `/var/data/gengar` off-service, including photos, catalog, reviews and the `backups` directory. Review snapshots written on save help recovery but are not an off-site backup policy.
- The JSON store uses one serialized writer and revision checks. Use one service instance; do not scale this file store across instances.

No domain has been purchased or connected. No paid Render service has been created. Final card review remains in progress; the public view uses only records marked ready.

References: [Render web services](https://render.com/docs/web-services), [persistent disks](https://render.com/docs/disks), [environment variables](https://render.com/docs/configure-environment-variables).
