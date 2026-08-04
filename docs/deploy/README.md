# Deploy — mi-coach en producción

La app corre en cualquier máquina con Node 20+: **tu PC, un homelab (Proxmox LXC, Raspberry Pi, mini-PC…) o un VPS**. En producción un **solo proceso** Express (`server/dist/index.js`) sirve la API en `/api/*` y el frontend buildeado (`client/dist`) como SPA — no hace falta nginx, Docker ni ningún servicio externo.

Esta guía cubre el caso típico: **Linux + systemd**. Ajustá rutas, usuario e IPs a tu entorno.

## 1. Dependencias + usuario de servicio

```bash
apt update && apt install -y curl git
# Node 20 LTS (o más nuevo):
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs build-essential   # build-essential: better-sqlite3 compila binario nativo

# Usuario de servicio sin login:
useradd --system --create-home --shell /usr/sbin/nologin micoach

# Volumen persistente para coach.db (fuera del repo, sobrevive a git pull):
mkdir -p /var/lib/mi-coach
chown micoach:micoach /var/lib/mi-coach
```

## 2. Clonar, instalar, buildear

```bash
git clone https://github.com/Mariano185/mi-coach.git /opt/mi-coach   # o tu fork
cd /opt/mi-coach
npm install
npm run build
chown -R micoach:micoach /opt/mi-coach
```

## 3. Datos existentes (opcional)

Si ya venías usando la app en otra máquina, copiá tu `coach.db` al volumen persistente:

```bash
scp coach.db root@<ip-del-servidor>:/var/lib/mi-coach/coach.db
# En el servidor:
chown micoach:micoach /var/lib/mi-coach/coach.db
```

Si arrancás de cero, salteá este paso: el server crea y seedea `coach.db` solo en `COACH_DB_PATH` al primer arranque.

## 4. systemd

```bash
cp /opt/mi-coach/docs/deploy/mi-coach.service /etc/systemd/system/
# Editá el service antes de arrancar: como mínimo AUTH_PASSWORD (password del login).
systemctl daemon-reload
systemctl enable --now mi-coach
systemctl status mi-coach --no-pager
journalctl -u mi-coach -f      # logs en vivo
```

App disponible en `http://<ip-del-servidor>:3001`.

En el primer arranque el server:

- hashea `AUTH_PASSWORD` con bcrypt y lo guarda en la DB (después la DB es la fuente de verdad; el env var deja de importar), y
- genera la **coach API key** y la imprime **una sola vez** en el log. Guardala: es la que usa el coach (IA o humano) en el header `X-Coach-Key`. Para recuperarla: `journalctl -u mi-coach | grep coach_api_key`, o leerla de la tabla `settings`.

> **Cookie y HTTPS:** con `NODE_ENV=production` la cookie de sesión se marca `secure`, así que el login de browser necesita HTTPS (Tailscale Funnel, un reverse proxy con TLS, etc.). Si vas a usar la app solo por HTTP plano en tu LAN, quitá `Environment=NODE_ENV=production` del service.

## 5. Actualizar a una versión nueva

```bash
cd /opt/mi-coach
git pull
npm install
npm run build
systemctl restart mi-coach
```

`coach.db` no se toca: vive en `/var/lib/mi-coach`, fuera del repo. Las migraciones de esquema son idempotentes y corren solas al arrancar.

## 6. Acceso remoto (opcional)

Para usar la app fuera de tu red (p. ej. desde el celular en el gym) sin abrir puertos:

- **Tailscale / Tailscale Funnel** — guía paso a paso en [`TAILSCALE.md`](./TAILSCALE.md), incluye cómo instalar la PWA en iOS y cómo resetear el password.
- Cualquier alternativa equivalente funciona igual: WireGuard u otra VPN, o un reverse proxy con TLS (Caddy, nginx + certbot) apuntando a `localhost:3001`. La app ya trae auth por password.

## 7. Backups

- Todo el estado vive en **un solo archivo**: `coach.db` (más sus sidecars WAL).
- Si el server está corriendo, no copies el archivo directo: usá `sqlite3 /var/lib/mi-coach/coach.db ".backup /ruta/backup.db"` o pará el servicio antes de copiar.
- Si corrés en Proxmox u otro hipervisor, los snapshots/backups de la VM o el contenedor cubren todo, incluido `/var/lib/mi-coach`.

## Apéndice: crear un contenedor LXC en Proxmox

Si tu homelab es Proxmox, un CT Debian mínimo alcanza de sobra (la app es livianísima):

```bash
# En el host Proxmox — plantilla Debian 12 (descargar si no está):
pveam update && pveam available | grep debian-12
pveam download local debian-12-standard_12.7-1_amd64.tar.zst

# Crear el CT (ajustá VMID, storage, bridge e IP a tu red):
pct create <VMID> local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname mi-coach \
  --cores 1 --memory 512 --swap 512 \
  --rootfs local-lvm:4 \
  --net0 name=eth0,bridge=vmbr0,ip=<ip-del-ct>/24,gw=<gateway> \
  --unprivileged 1 --features nesting=1 --onboot 1

pct start <VMID>
pct enter <VMID>
# ...y seguí desde el paso 1 de esta guía dentro del CT.
```

## Nota: SQLite + WAL

**No abras una segunda conexión SQLite directa a `coach.db` mientras el server corre** (lecturas vacías o erróneas por el lock WAL). Para queries ad-hoc usá la API, o pará el servicio primero (`systemctl stop mi-coach`).
