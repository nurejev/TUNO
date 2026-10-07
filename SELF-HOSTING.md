# Self-hosting TUNO

> **You are reading the beta-channel copy.** Every URL and image tag on this page points at the `beta` branch and the `:beta` image, so self-hosting is testable here rather than only after promotion. The production copy on `main` will say `main` and `:latest` throughout — the beta→main port rewrites them (parity slice 22). Until TUNO 2.0 is promoted there is no `:latest` image worth running: `main` is still v1.0.13, from before the workspace shell.

TUNO is static files and a browser — no server code, no database, nothing stored anywhere. That makes it trivially self-hostable, and some tenants require it: a tool that reads and writes Intune policy is exactly the kind of thing an organisation wants served from its own infrastructure. The machinery is ENCA's (its R06), ported whole in beta 10693.

## ⚠️ Read this first: the redirect URI

**This is the one step no script or template can do for you, and skipping it is what produces the confusing sign-in error.**

Every host you serve TUNO from — `http://localhost:8080`, `https://tuno.yourcompany.com`, an Azure Container Apps URL — must be registered as a **single-page application (SPA) redirect URI** on the Entra app registration TUNO signs in with. If it is not, sign-in fails with **AADSTS50011** ("The redirect URI specified in the request does not match").

Two ways to do it:

1. **Your own app registration (recommended for self-hosting).** Run [`New-TunoAppRegistration.ps1`](New-TunoAppRegistration.ps1) — it creates a registration in *your* tenant, consents TUNO's delegated scopes and adds your host's redirect URI. Then hand its client id to the container (next section). Your own registration, your own host: no dependency on anything of ours at run time.

   Name it yours with `-AppName` — the registration lands in *your* Enterprise applications list, where a vendor's name on an app you own is at best confusing:

   ```powershell
   ./New-TunoAppRegistration.ps1 -SingleTenant -AppName "Contoso Intune Utilities" `
     -SingleTenantRedirectUris "https://tuno.contoso.example","http://localhost:8080"
   ```

   The name is the handle the script looks the app up by, so **re-run it with exactly the same `-AppName` to update** (a build that adds a scope says so in What's new); a different name creates a second registration with a new client ID and orphans the consent recorded against the first. To rename one that already exists, pass `-AppObjectId` alongside the new `-AppName`. Today the script **replaces** the SPA redirect list on every run, so name every host each time; merging is parity slice 17.
2. **An existing registration.** Entra admin center → App registrations → your app → Authentication → *Single-page application* → add your URL exactly, including the port.

## Prerequisite: Docker

Everything below needs Docker running locally. Skip this section if `docker info` already answers without an error. Azure Container Apps needs none of it — nothing is built or run on your machine there.

**macOS** — [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/), macOS 14 or newer:

```bash
brew install --cask docker-desktop
```

The cask was renamed: it used to be `docker`, so an older note telling you `brew install --cask docker` is out of date. Without Homebrew, download the installer directly — [Apple silicon](https://desktop.docker.com/mac/main/arm64/Docker.dmg) (M1 and later) or [Intel](https://desktop.docker.com/mac/main/amd64/Docker.dmg) — then open the `.dmg` and drag Docker to Applications.

**Windows** — [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/), which uses WSL 2:

```powershell
winget install -e --id Docker.DockerDesktop
```

Or download the installer: [x86_64](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe) · [Arm64](https://desktop.docker.com/win/main/arm64/Docker%20Desktop%20Installer.exe). WSL 2 is installed for you if it is missing, and **that needs a reboot** — worth knowing before you start rather than halfway through.

**Linux** — Docker Engine is enough; you do not need Desktop. Follow [the install guide for your distribution](https://docs.docker.com/engine/install/), then add yourself to the `docker` group (`sudo usermod -aG docker $USER`, then log out and back in) so the commands below work without `sudo`.

**On every platform, start Docker Desktop once after installing** and wait for the whale icon to settle. The install scripts check for this and stop with a clear message if the daemon is not up, because "Docker is installed but not running" is the single most common way the quick start below fails.

```bash
docker --version && docker info >/dev/null && echo "Docker is ready"
```

## Quick start on your own machine

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/nurejev/TUNO/beta/selfhost/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/nurejev/TUNO/beta/selfhost/install.ps1 | iex
```

Either script checks Docker is running, pulls `ghcr.io/nurejev/tuno:beta`, starts it at `http://localhost:8080`, and prints the redirect-URI instructions above. Pass a port (`bash install.sh 9090` / `-Port 9090`) if 8080 is taken; `TUNO_TAG=latest` / `-Tag latest` will select the production channel once there is one.

## Pointing it at your own app registration

Two environment variables, and nothing to edit or rebuild.

**macOS / Linux** (`\` continues a line in bash):

```bash
docker run -d --name tuno -p 8080:80 --restart unless-stopped \
  -e TUNO_CLIENT_ID=00000000-1111-2222-3333-444444444444 \
  -e TUNO_TENANT_ID=55555555-6666-7777-8888-999999999999 \
  ghcr.io/nurejev/tuno:beta
```

**Windows PowerShell** — the continuation character is a backtick, not a backslash. Pasting the bash form above into PowerShell runs the first line on its own and fails with `docker: invalid reference format`:

```powershell
docker run -d --name tuno -p 8080:80 --restart unless-stopped `
  -e TUNO_CLIENT_ID=00000000-1111-2222-3333-444444444444 `
  -e TUNO_TENANT_ID=55555555-6666-7777-8888-999999999999 `
  ghcr.io/nurejev/tuno:beta
```

`TUNO_CLIENT_ID` is the Application (client) ID printed by `New-TunoAppRegistration.ps1`. `TUNO_TENANT_ID` is only for a **single-tenant** registration (`-SingleTenant`) — omit it for a multi-tenant one and the shared `organizations` authority is kept. `TUNO_AUTHORITY` takes a full URL for a verified domain or a national cloud.

The container's entrypoint applies them to `js/authConfig.js` at start, and **does nothing at all when they are unset** — the image without them behaves exactly as before. Values that are not a plain GUID or `https://` URL are refused rather than escaped, and the container does not start: a value able to close a JavaScript string literal would be script injection into the sign-in page, and a copy quietly serving the wrong registration is worse than one that is down.

The install scripts take the same thing (`TUNO_CLIENT_ID=… bash install.sh`, `.\install.ps1 -ClientId … -TenantId …`) and the compose file reads both from your environment. **Every one of these still needs that host registered as a SPA redirect URI** — the variables change which registration you sign in to, not what it will accept.

Editing files still works if you prefer it: drop a `js/authConfig.local.js` setting `window.TUNO_AUTH` and reference it from `index.html` just before `js/authConfig.js`. That route survives a `git pull`; it needs an image you build yourself.

## Plain Docker

```bash
docker run -d --name tuno -p 8080:80 --restart unless-stopped ghcr.io/nurejev/tuno:beta
```

Or with compose — see [`selfhost/docker-compose.yml`](selfhost/docker-compose.yml). The image is nginx over the repo's files, built by [the workflow](.github/workflows/docker.yml) on every push: `:beta` from the beta channel, `:latest` from `main` once TUNO 2.0 lands there. To build it yourself instead of trusting ours: `docker build -t tuno .` in a clone — what you run is what you can read. Anonymous pull requires the GHCR package to be **Public** (github.com → Packages → tuno → Package settings); if a pull is refused, that is the first thing to check.

## Azure Container Apps

The image runs as it is on Azure Container Apps with **scale-to-zero** (min 0 / max 1 replicas, 0.25 vCPU / 0.5 GiB), so an instance used by one team costs close to nothing while idle. The platform has no filesystem to mount into, which is exactly what the environment variables are for. From the CLI:

```bash
APP=tuno; RG=tuno-rg; LOC=westeurope
az group create -n $RG -l $LOC
az containerapp env create -n $APP-env -g $RG -l $LOC
az containerapp create -n $APP -g $RG --environment $APP-env \
  --image ghcr.io/nurejev/tuno:beta --target-port 80 --ingress external \
  --min-replicas 0 --max-replicas 1 --cpu 0.25 --memory 0.5Gi \
  --env-vars TUNO_CLIENT_ID=<guid> TUNO_TENANT_ID=<guid>
az containerapp show -n $APP -g $RG --query properties.configuration.ingress.fqdn -o tsv
```

The last line prints the app's host: **add `https://<that host>` as a SPA redirect URI** on your app registration, or sign-in fails with AADSTS50011. For a copy other people rely on, pin a digest rather than the tag (see *Pinned installs* below): with scale-to-zero, a tag is re-pulled on most cold starts, so a tag-pinned instance follows every push to `beta` whether or not you meant it to.

A one-click **Deploy to Azure** template and the branding dialog's **☁ Save to this deployment** are parity slice 21 and not here yet. If the container app deploys but never becomes healthy, an unauthorised pull (the package still Private) is the first thing to check, in the Container App's *Log stream*.

## Branding your instance

A self-hosted instance can wear your organisation's identity without forking — the same mechanism as the per-audience looks on the hosted site:

1. Click your initials (top right) and choose **Branding settings** from the account menu. It opens the branding settings: product and organisation names, logos, login text, and light/dark colour palettes.
2. **Apply in this browser** previews and keeps the look locally (per browser).
3. **Import from JSON** loads an existing `selfhost-branding.json` into the form for review — a look made on another machine, or handed to you as a file, never has to be retyped.
4. **Download selfhost-branding.json** exports the same settings as a file. Serve it at the site root — the compose file and install scripts mount `./selfhost-branding.json` automatically — and **every visitor** to your instance gets the branding.
5. **For a platform with no filesystem to mount into**, hand the same JSON to the container as a value:

   ```bash
   docker run -e TUNO_BRANDING="$(cat selfhost-branding.json)" ...
   az containerapp update -n tuno -g <rg> --set-env-vars TUNO_BRANDING="$(cat selfhost-branding.json)"
   ```

   `TUNO_BRANDING` takes the JSON raw or base64-encoded (for a platform that mangles braces). The entrypoint writes it to `selfhost-branding.json` at the site root — the same path the download tells you to serve from, so the two routes are the same mechanism reached two ways. The dialog's own **Copy for container** button, with its size readout, is parity slice 20.

   It also writes the same branding into `js/selfhost-boot.js`, the script that runs before the page paints, so the **first** visit in a browser is branded too. Without it the app can only fetch the file, and a fetch cannot finish before the first paint: a new visitor saw the image's own look for a moment and then the deployment's. This happens for a mounted file as well as for the variable, a start without branding removes the block again, and a host with no entrypoint (GitHub Pages, a plain static server) is unaffected — it behaves as it always did, branded from the second visit on.

   > **Size limit, and it is a hard one.** Linux refuses a single environment variable over **128 KB** and hands the whole environment to `exec()`, so a container carrying one bigger than that **fails to start at all** — not nginx, not the entrypoint, nothing — with `argument list too long` in the log. Since the app is served *by* that container, you then have to remove the variable from the portal or the CLI to get it back. An embedded PNG logo is almost always what crosses the line; the SVG marks TUNO's own customer brandings use stay around 15 KB. Keep the value under 48 KB; for anything larger, serve the same JSON at a URL and set **`TUNO_BRANDING_URL`**, which the container fetches at start with no size limit. A fetch that fails leaves the instance unbranded rather than refusing to serve.

Branding saved with **Apply in this browser** stays in that browser. Only the file and the environment variable reach other people — that distinction is deliberate, and it is why the dialog has three buttons rather than one. A branded copy wears the slate **SELF-HOSTED** ribbon, never the red BETA one: any host that is neither `tuno.limon-it.nl` nor the beta site is somebody's own copy, and the app says so.

Exports keep the neutral TUNO credit by design, exactly like the hosted per-audience looks. For a full rebrand including export credits, fork and edit `js/branding.js` — its header comment is the guide.

## Staying up to date

A self-hosted copy stops hearing about fixes the moment it exists. The sign-in card and the footer show the build it runs; compare with the beta site's footer, and read 📋 What's new there for what changed between the two. An in-app notice that says how many builds behind you are is parity slice 23 and not here yet.

**The app cannot update itself, and that is not an oversight.** It is static files in a browser with no server behind it: nothing in it can restart a container, and anything that could would be a control plane you would then have to trust. Not auto-updating is also the point of a pinned, reviewed copy — nothing changes without a review.

To update a Docker instance:

```bash
docker pull ghcr.io/nurejev/tuno:beta
docker rm -f tuno
# then the same docker run / compose up -d as before
```

Azure Container Apps — restarting the active revision re-pulls the tag.

**bash:**

```bash
APP=<app-name>; RG=<resource-group>
az containerapp revision restart -n $APP -g $RG \
  --revision $(az containerapp show -n $APP -g $RG --query properties.latestRevisionName -o tsv)
```

**PowerShell** — different continuation character *and* different substitution syntax, so the bash form does not survive a paste:

```powershell
$APP = "<app-name>"; $RG = "<resource-group>"
$rev = az containerapp show -n $APP -g $RG --query properties.latestRevisionName -o tsv
az containerapp revision restart -n $APP -g $RG --revision $rev
```

Or in the portal: **Revisions and replicas → the active revision → Restart**. `az containerapp revision copy -n $APP -g $RG` does it too, and leaves a revision to roll back to. Do **not** reach for `az containerapp update --image <the same tag>`: an unchanged image reference is not a revision-scope change, so it can create no revision and do nothing — a command that looks like it worked and did not.

**One honest exception.** Container Apps sets every container's image pull policy to `always`, so a container that *starts* pulls the tag fresh. With scale-to-zero (min 0 replicas), an idle instance therefore picks up a republished `:beta` on its next cold start, without anyone asking it to. If you want a genuinely pinned deployment there, use a digest (`ghcr.io/nurejev/tuno@sha256:…`) or your own immutable tag as the image — a mutable tag plus scale-to-zero is a rolling deployment whether or not it was meant as one.

For a reviewed fork: `git fetch upstream && git merge upstream/beta`, re-review the diff, redeploy. A build can ask for a new delegated scope; What's new says so, and your own registration then needs `New-TunoAppRegistration.ps1` run again (same `-AppName`) and admin consent for it.

## Pinned installs: update and roll back

For a copy other people rely on — a customer's rollout running from it — run a **digest**, not a tag. `ghcr.io/nurejev/tuno@sha256:…` names exactly one build: it cannot change under you, every replica serves the same thing, and going back is putting the previous digest back. A tag (`:beta`, `:latest`) moves with every push, and on Container Apps with scale-to-zero it moves your instance too (see above).

**1. Write down what you run now.** This is your way back.

Docker:

```bash
docker image inspect --format '{{index .RepoDigests 0}}' "$(docker inspect tuno --format '{{.Image}}')"
```

Azure Container Apps (bash or PowerShell, the same line):

```bash
az containerapp show -n <app-name> -g <resource-group> --query "properties.template.containers[0].image" -o tsv
```

If that prints a tag rather than `…@sha256:…`, the instance is not pinned yet. The steps below pin it.

**2. Find the digest of the build you want.**

```bash
bash selfhost/resolve-digest.sh                          # ghcr.io/nurejev/tuno:beta, today
bash selfhost/resolve-digest.sh ghcr.io/nurejev/tuno:beta
```

It asks the registry one question and prints the pinned reference to deploy. You can run it from a clone or straight from the repo: `curl -fsSL https://raw.githubusercontent.com/nurejev/TUNO/beta/selfhost/resolve-digest.sh | bash`. Without bash, `docker buildx imagetools inspect ghcr.io/nurejev/tuno:beta` prints the same `Digest:` line. Check that the build is the one you mean first: the footer of the beta site shows what `:beta` currently carries.

**3. Deploy it.**

Docker — pull, then recreate with the same flags as before, pinned:

```bash
NEW=ghcr.io/nurejev/tuno@sha256:<digest>
docker pull "$NEW"
docker rm -f tuno
docker run -d --name tuno -p 8080:80 --restart unless-stopped <your -e / -v flags> "$NEW"
```

Compose: put the same reference on the `image:` line of `docker-compose.yml`, then `docker compose up -d`.

Azure Container Apps — a new image reference creates a new revision:

```bash
az containerapp update -n <app-name> -g <resource-group> --image ghcr.io/nurejev/tuno@sha256:<digest>
```

```powershell
az containerapp update -n "<app-name>" -g "<resource-group>" --image "ghcr.io/nurejev/tuno@sha256:<digest>"
```

Terraform, Bicep or ARM: put the digest in your variables, and refuse tags there. A pipeline on a schedule or a trigger is how a "pinned" deployment ends up updating itself.

**4. Check it.** The footer shows the new build, sign-in still works, and your branding is still there. On Container Apps, **Revisions and replicas** shows one active revision, Running.

**5. Roll back** — the same command as step 3, with the reference you wrote down in step 1. It brings back exactly the old build, because a digest cannot have changed in the meantime. On Container Apps in single-revision mode, that creates a new revision with the old image and replaces the current one.

## What the image is, and what it is not

The image is `nginx:1.27-alpine` plus this repository's files, with the security headers GitHub Pages cannot set (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) and `no-store` on the four files whose content can change without their `?v=` changing: `index.html`, `selfhost-branding.json`, `js/selfhost-boot.js` and `js/authConfig.js`. The Content-Security-Policy stays in `index.html` as a meta tag, so it is identical on every host and reviewed once. [`SECURITY.md`](SECURITY.md) describes the rest of the model; nothing in it changes because the files are served from your server instead of ours.

What is still to come for self-hosted copies is listed on the roadmap under R41: the branding dialog's **Copy for container** and size readout (slice 20), **Deploy to Azure** and **☁ Save to this deployment** (slice 21), the promotion carve-out that rewrites this page for `main` (slice 22), and the update notice for pinned copies (slice 23).
