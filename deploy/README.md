# Deploy — mi-coach en un CT de Proxmox (Node + systemd)

App single-user, local-first (SQLite). En producción un **solo proceso** Express
(`server/dist/index.js`) sirve la API en `/api/*` y el frontend buildeado
(`client/dist`) como SPA. Acceso por IP:puerto dentro de la red WireGuard.

## 1. Crear el CT (en el host Proxmox)

```bash
# Plantilla Debian 12 (descargar si no está):
pveam update && pveam available | grep debian-12
pveam download local debian-12-standard_12.7-1_amd64.tar.zst

# Crear CT (ajustá VMID, storage, bridge y la IP):
pct create 110 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname mi-coach \
  --cores 1 --memory 512 --swap 512 \
  --rootfs local-lvm:4 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.0.110/24,gw=192.168.0.1 \
  --unprivileged 1 --features nesting=1 --onboot 1

pct start 110
pct enter 110
```

## 2. Dentro del CT: dependencias + usuario

```bash
apt update && apt install -y curl git
# Node 20 LTS:
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs build-essential   # build-essential: better-sqlite3 compila binario nativo

# Usuario de servicio sin login:
useradd --system --create-home --shell /usr/sbin/nologin micoach

# Volumen persistente para coach.db (fuera del repo):
mkdir -p /var/lib/mi-coach
chown micoach:micoach /var/lib/mi-coach
```

## 3. Clonar, instalar, buildear

```bash
git clone https://github.com/Mariano185/mi-coach.git /opt/mi-coach
cd /opt/mi-coach
npm install
npm run build
chown -R micoach:micoach /opt/mi-coach
```

## 4. Copiar tus datos (coach.db) — desde tu PC

```bash
# En tu PC (no en el CT), con WireGuard activo:
scp coach.db root@192.168.0.110:/var/lib/mi-coach/coach.db
# En el CT, dar permisos:
chown micoach:micoach /var/lib/mi-coach/coach.db
```

> Si querés arrancar limpio, salteá este paso: el server crea y seedea
> `coach.db` solo en `COACH_DB_PATH` al primer arranque.

## 5. systemd

```bash
cp /opt/mi-coach/deploy/mi-coach.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mi-coach
systemctl status mi-coach --no-pager
journalctl -u mi-coach -f      # ver logs en vivo
```

App disponible en `http://192.168.0.110:3001` dentro de la red WireGuard.

## 6. Exponer al exterior con Tailscale Funnel (opcional)

Para usar la app desde el celular del gym sin cliente VPN, seguí
[`deploy/TAILSCALE.md`](./TAILSCALE.md). Pasos: instalar Tailscale en el CT,
activar Funnel en :3001, agregar la URL a Safari como PWA.

## 7. Actualizar a una versión nueva

```bash
cd /opt/mi-coach
git pull
npm install
npm run build
systemctl restart mi-coach
```

`coach.db` no se toca: vive en `/var/lib/mi-coach`, fuera del repo.

## Backups

Snapshots/backups del CT en Proxmox cubren todo, incluido `/var/lib/mi-coach/coach.db`.
Programá un backup periódico del CT 110 en **Datacenter → Backup**.
