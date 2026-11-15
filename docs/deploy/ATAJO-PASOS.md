# Pasos diarios desde el iPhone (atajo de iOS)

Los **Pasos diarios** no se cargan a mano: un atajo de iOS lee de **Salud** el total de pasos de
ayer y lo manda a la app todas las noches a las 00:05, con la fecha de ayer. Un envío nuevo para la
misma fecha la corrige, así que correr el atajo a mano a la mañana es seguro.

> **Requisitos:** la app expuesta por HTTPS (Tailscale Funnel, ver [`TAILSCALE.md`](./TAILSCALE.md))
> y la **clave del dispositivo**.

## 1. Sacar la clave del dispositivo

El server genera en el primer arranque una clave propia del atajo (`device_api_key`), distinta de
la del coach, y la imprime **una sola vez** en el log:

```bash
journalctl -u mi-coach | grep device_api_key
```

Si el log ya rotó, leela de la tabla `settings` (clave `device_api_key`).

Esa clave **solo** sirve para `PUT /api/pasos`: con ella cualquier otra ruta de `/api` da `401`.
Si el teléfono se pierde o la clave se filtra, el daño queda acotado a poder escribir pasos.
Para rotarla: parar el servicio, borrar la fila `device_api_key` de `settings`, arrancar (se genera
una nueva y sale en el log) y actualizar el atajo.

## 2. Probar el endpoint antes de armar el atajo

```bash
curl -s -X PUT "https://<machine>.<tailnet>.ts.net/api/pasos" \
  -H "X-Device-Key: <clave>" -H "Content-Type: application/json" \
  -d '{"fecha":"2026-11-14","pasos":8234}'
# → {"id":1,"fecha":"2026-11-14","pasos":8234,...}
```

`fecha` es `YYYY-MM-DD` y tiene que ser una fecha real; `pasos` un entero ≥ 0 (un decimal da `400`).

## 3. Armar el atajo

En la app **Atajos** → pestaña **Atajos** → **+**. Nombre: `Pasos a mi-coach`. Acciones, en orden:

1. **Fecha** (fecha actual).
2. **Ajustar fecha** → *Obtener inicio del día* sobre la Fecha. Renombrá el resultado `Hoy`.
3. **Ajustar fecha** → *Restar* `1` *días* a `Hoy`. Renombrá el resultado `Ayer`.
4. **Buscar muestras de salud**:
   - Tipo: **Pasos**.
   - Filtro: *Fecha de inicio* **está entre** `Ayer` y `Hoy`.
   - **Agrupar por: Día**. Importante: sin agrupar, el atajo suma las muestras crudas de todas las
     fuentes y, si usás Apple Watch, cuenta los pasos dos veces (iPhone + reloj). Agrupado por día
     devuelve el total que muestra la app Salud. Compará el número contra Salud la primera vez.
5. **Obtener detalles de muestras de salud** → *Valor*.
6. **Redondear número** → al entero (Salud puede devolver un valor con decimales).
7. **Formatear fecha** → `Ayer`, formato **Personalizado** `yyyy-MM-dd`.
8. **Obtener contenido de URL**:
   - URL: `https://<machine>.<tailnet>.ts.net/api/pasos` (la URL pública del Funnel).
   - Método: **PUT**.
   - Encabezados: `X-Device-Key` = la clave del paso 1.
   - Cuerpo de la solicitud: **JSON**, con dos campos:
     - `fecha` (**Texto**) = la fecha formateada del paso 7.
     - `pasos` (**Número**) = el número redondeado del paso 6.

Correlo una vez a mano: la primera vez iOS pide permiso para leer Salud y para conectarse al
dominio `ts.net`. Aceptá los dos. Si la respuesta trae `"pasos"`, quedó guardado; abrí Nutrición
en la app, elegí la fecha de ayer y tienen que aparecer.

## 4. Automatizarlo a las 00:05

Atajos → pestaña **Automatización** → **+** → **Hora del día**:

- Hora: **00:05**, **Diariamente**.
- **Ejecutar inmediatamente** (no *Preguntar antes de ejecutar*), y apagá *Notificar al ejecutar*
  si no querés el aviso.
- Acción: **Ejecutar atajo** → `Pasos a mi-coach`.

A las 00:05 el día anterior ya terminó, así que el total es definitivo. Si el iPhone estaba
apagado o sin red, esa fecha no llega (en la app y para el coach queda "no llegó", no "0 pasos");
para recuperarla, corré el atajo a mano antes de la medianoche siguiente (siempre manda **ayer**).

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| `401` | Clave mal copiada, header con otro nombre, o método distinto de `PUT`. |
| `400 pasos …` | El campo `pasos` viaja como Texto o con decimales: revisá el tipo en el JSON y el paso 6. |
| `400 fecha …` | Formato de fecha distinto de `yyyy-MM-dd` (ojo con `YYYY`, que es el año de la semana ISO). |
| El número no coincide con Salud | Falta *Agrupar por: Día* en el paso 4 (doble conteo iPhone + Watch). |
| No corre solo | La automatización quedó en *Preguntar antes de ejecutar*, o iOS en Modo de bajo consumo la demoró. |
