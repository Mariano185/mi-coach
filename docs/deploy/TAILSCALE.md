# Exponer mi-coach al exterior con Tailscale Funnel

> **Para qué**: usar la app desde el celular del gym sin cliente VPN.
> **Cómo**: Tailscale en el CT, Funnel expone `localhost:3001` como HTTPS público.
> **Auth**: el server tiene password + cookie (30 días). No se necesita nada más en Tailscale.

URL pública final: `https://<nombre-de-la-máquina>.<tailnet>.ts.net`

---

## 1. Instalar Tailscale en el CT

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
# Te va a pedir un login URL. Abrilo en tu PC, logueate, y el nodo queda en tu tailnet.
```

Verificá:
```bash
tailscale status          # tu CT aparece
tailscale ip -4           # IP 100.x
```

Activá HTTPS (MagicDNS) y Funnel:
```bash
tailscale set --accept-routes
tailscale https enable    # opcional: certs locales para uso por tailnet
```

---

## 2. Exponer el puerto 3001 con Funnel

```bash
# Como el server Express escucha en :3001, exponemos ese puerto.
# Apretá 'y' si te pregunta algo.
sudo tailscale funnel 3001
```

Resultado esperado:
```
https://<machine>.<tailnet>.ts.net
|-- / proxy http://localhost:3001
```

Probalo desde el celular (con 4G, **no** en la red del homelab):
```
https://<machine>.<tailnet>.ts.net
```
Te tiene que aparecer la pantalla de login de Mi Coach.

---

## 3. Hacer Funnel persistente (systemd)

Por defecto Funnel se cae al reiniciar el CT. Creamos un oneshot que lo levante en el boot.

```bash
sudo tee /etc/systemd/system/tailscale-funnel.service > /dev/null <<'EOF'
[Unit]
Description=Tailscale Funnel for mi-coach
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/tailscale funnel 3001
# Si querés exponer por HTTPS detrás de un path específico:
# ExecStart=/usr/bin/tailscale funnel --bg 3001

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now tailscale-funnel
sudo systemctl status tailscale-funnel --no-pager
```

Verificá:
```bash
tailscale funnel status
# Debe listar https://<machine>.<tailnet>.ts.net → http://localhost:3001
```

---

## 4. PWA: agregar a inicio en iOS

1. Abrí `https://<machine>.<tailnet>.ts.net` en **Safari** del iPhone.
2. Tocá el botón Compartir → **"Añadir a pantalla de inicio"**.
3. Queda con icono propio (dumbbell lima) y se abre full-screen, sin barra de Safari.
4. El password te lo pide una vez; la cookie dura 30 días.

> **Importante**: solo Safari permite "Añadir a pantalla de inicio" con la PWA completa. Chrome/Firefox en iOS usan su propio wrapper y no toman el manifest. Usá Safari.

---

## 5. Resetear / cambiar el password

El password se hashea con bcrypt y se guarda en la tabla `settings` de la DB. Para resetearlo:

1. Parar el server: `sudo systemctl stop mi-coach`
2. En `.env` o en el override de systemd, cambiar `AUTH_PASSWORD=tu-clave-nueva`
3. Borrar el hash viejo de la DB:
   ```bash
   sqlite3 /var/lib/mi-coach/coach.db "DELETE FROM settings WHERE clave='auth_password_hash';"
   ```
4. Levantar: `sudo systemctl start mi-coach` → el server hashea el nuevo password al boot.
