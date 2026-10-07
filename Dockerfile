# ======================================================================
# TUNO self-hosting image — nginx over the static files (ENCA's R06
# image, ported in beta 10693; parity slice 18).
#
# The app is static files and a browser: no server-side code, no database,
# nothing stored. This image is nothing more than nginx serving the repo,
# which is the whole point — what you run is what you can read.
#
# Build:  docker build -t tuno .
# Run:    docker run -d --name tuno -p 8080:80 tuno
# Or use the published image: ghcr.io/nurejev/tuno:beta  (:latest once
# TUNO 2.0 is promoted to main) — see SELF-HOSTING.md, and read the
# redirect-URI section there FIRST: it is the one step that cannot be
# automated and the one that produces the confusing sign-in error when
# missed.
# ======================================================================
FROM nginx:1.27-alpine

# Our own server config: security headers, sane caching, gzip.
COPY selfhost/nginx.conf /etc/nginx/conf.d/default.conf

# The site itself. .dockerignore keeps .git, _to_delete, node_modules, the
# tests, the local-only customer brandings and the deploy scaffolding out
# of the image.
COPY . /usr/share/nginx/html/

# A CNAME file belongs to GitHub Pages on the canonical host, not to a
# self-hosted copy (the beta tree has none; main may). The entrypoint has to
# stay in the build context so the COPY below can reach it, which means
# `COPY .` also drops a copy into the web root - remove that one, because
# nothing served to a browser should be a shell script.
RUN rm -f /usr/share/nginx/html/CNAME \
 && rm -f /usr/share/nginx/html/selfhost/docker-entrypoint.sh \
 # COPY preserves local permissions, including owner-only editor files.
 # nginx workers must be able to traverse and read the published site.
 && find /usr/share/nginx/html -type d -exec chmod 755 {} + \
 && find /usr/share/nginx/html -type f -exec chmod 644 {} +

# Point the copy at YOUR OWN app registration without forking or rebuilding:
#   -e TUNO_CLIENT_ID=<guid> [-e TUNO_TENANT_ID=<guid>]
# The entrypoint applies them to js/authConfig.js at start and does nothing
# at all when they are unset, so the image is unchanged without them. This is
# what makes the promise hold on Azure Container Apps, where there is no
# filesystem to mount a config file into. See selfhost/docker-entrypoint.sh.
COPY selfhost/docker-entrypoint.sh /docker-entrypoint-tuno.sh
RUN chmod +x /docker-entrypoint-tuno.sh
ENTRYPOINT ["/docker-entrypoint-tuno.sh"]
CMD ["nginx", "-g", "daemon off;"]
