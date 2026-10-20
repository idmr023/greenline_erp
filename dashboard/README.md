# Dashboard GreenLine — Google Sheets con Python

Dashboard web en **Python (Flask)** que lee tus **Google Sheets** y los muestra en
tablas, KPIs y gráficas. La fuente de datos se cambia **editando un enlace** en
`config/fuentes.yaml` — sin tocar código.

---

## 1. Requisitos

- Python 3.13+ (ya instalado en este equipo con `winget install Python.Python.3.13`)
- Un Google Sheet **compartido públicamente**:
  en Google Sheets → **Compartir** → **«Cualquier persona con el enlace puede ver»**
  (sin esto, Google no deja leer los datos)

## 2. Instalación (una sola vez)

Desde la carpeta `dashboard/`:

```powershell
py -m venv .venv                          # crea el entorno virtual
.venv\Scripts\python -m pip install -r requirements.txt
```

## 3. Colocar los enlaces (la fuente de datos)

Todo está en **`config/fuentes.yaml`**. Una entrada por hoja:

```yaml
fuentes:
  - id: inventario                       # minúsculas, sin espacios (se usa en la URL)
    nombre: "Inventario almacén"         # lo que se ve en el selector
    url: "https://docs.google.com/spreadsheets/d/AQUI_EL_ID/edit"
    hoja: "Hoja1"                        # nombre de la pestaña (opcional)
    descripcion: "Stock actual por SKU"  # opcional
    activa: true                         # false la oculta sin borrarla
```

**Cambiar el enlace (`url`) cambia la fuente de datos.** El dashboard lo toma al
recargar la página (la caché dura 5 minutos; ver §7).

Cómo sacar el enlace: abre tu Google Sheet → barra de direcciones → copia la URL
completa (`https://docs.google.com/spreadsheets/d/<ID>/edit...`).

## 4. Arrancar el dashboard

```powershell
.venv\Scripts\python app.py
```

Abre **http://127.0.0.1:5000**. Escucha en `0.0.0.0`, así que también abre
desde la red Wi-Fi con la IP LAN de tu PC (`ipconfig` → Dirección IPv4),
p. ej. `http://192.168.1.50:5000`. Para ese caso, define en `frontend/.env`
`VITE_DASHBOARD_URL=http://<IP-LAN>:5000` (si cambias de Wi-Fi, actualiza la IP).

| Página | Qué hace |
|---|---|
| `/` | Selector de fuente + tabla con buscador |
| `/dashboard/<id>` | Ejemplo de dashboard: KPIs + gráfica (plantilla para copiar) |
| `/dashboard/servicio-tecnico` | Dashboard dedicado: sedes, tipos de servicio y técnicos (fuente `servicio-tecnico`; en el ERP vive en `/admin/dashboard-embed?slug=servicio-tecnico`) |
| `/api/fuentes` | Lista de fuentes en JSON |
| `/api/datos/<id>` | Filas de la fuente en JSON (para consumir desde donde quieras) |

---

## 5. Cómo programar TUS dashboards

### 5.1 Leer datos desde Python

```python
from services.sheets import cargar_fuentes, cargar_datos

fuentes = cargar_fuentes()               # las de config/fuentes.yaml (activas)
fuente = fuentes[0]
filas = cargar_datos(fuente)             # [{columna: valor}, ...]
```

`filas` es una lista de diccionarios: `filas[0]["Student Name"]` → el valor de esa celda.

### 5.2 Crear una página nueva (3 pasos)

**Paso 1 — la ruta** en `app.py` (copia cualquier bloque `@app.route`):

```python
@app.route("/mi-dashboard")
def mi_dashboard():
    from services.sheets import cargar_datos, fuente_por_id
    fuente = fuente_por_id("inventario")          # el id de fuentes.yaml
    filas = cargar_datos(fuente)
    total = sum(float(f.get("Stock") or 0) for f in filas)   # ← tu cálculo
    return render_template("mi_dashboard.html", filas=filas, total=total)
```

**Paso 2 — la plantilla** `templates/mi_dashboard.html`:

```html
{% extends "base.html" %}
{% block contenido %}
  <h1>Mi dashboard</h1>
  <div class="tarjetas">
    <div class="tarjeta kpi">
      <span class="kpi-etiqueta">Stock total</span>
      <span class="kpi-valor">{{ total }}</span>
    </div>
  </div>
{% endblock %}
```

**Paso 3 — abrir** `http://127.0.0.1:5000/mi-dashboard`

### 5.3 Calcular KPIs con pandas

```python
import pandas as pd

df = pd.DataFrame(cargar_datos(fuente))
df["Stock"] = pd.to_numeric(df["Stock"], errors="coerce")

total_stock = df["Stock"].sum()
por_categoria = df.groupby("Categoria")["Stock"].sum().sort_values(ascending=False)
top5 = por_categoria.head(5)
```

Sin pandas también vale: `sum(float(f["Stock"]) for f in filas if f["Stock"])`.

### 5.4 Gráficas con Chart.js (copia y adapta)

Los datos se pasan de Python a la plantilla con `| tojson` y se pintan con
Chart.js (ya cargado en `base.html` vía las plantillas que lo necesiten).

**Barras:**

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<canvas id="mi-grafica" height="110"></canvas>
<script>
  new Chart(document.getElementById('mi-grafica'), {
    type: 'bar',
    data: {
      labels: {{ etiquetas | tojson }},
      datasets: [{ label: 'Stock', data: {{ valores | tojson }}, backgroundColor: '#2e7d32' }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
</script>
```

**Líneas:** cambia `type: 'bar'` por `type: 'line'`.
**Torta:** cambia a `type: 'pie'` y quita `scales`.

Para pasar `etiquetas` y `valores` desde la ruta:

```python
resumen = df.groupby("Categoria")["Stock"].sum()
return render_template("mi_dashboard.html",
                       etiquetas=list(resumen.index),
                       valores=list(resumen.values))
```

### 5.5 Filtros (por columna o fecha)

En la plantilla, un `<select>` + filtrar en JavaScript (como hace `index.html`),
o filtra en Python antes de renderizar:

```python
filas_2026 = [f for f in filas if f.get("Fecha", "").startswith("2026")]
```

Con pandas: `df[df["Fecha"] >= "2026-01-01"]`.

---

## 6. Estructura de archivos

```
dashboard/
├── config/fuentes.yaml     ← LOS ENLACES (fuente de datos)
├── services/sheets.py      ← lector: URL → filas (no tocar salvo casos raros)
├── app.py                  ← rutas del dashboard (aquí agregas las tuyas)
├── templates/              ← páginas HTML (una por dashboard)
│   ├── base.html           ← diseño común + navegación
│   ├── index.html          ← selector de fuente + tabla
│   ├── dashboard_ejemplo.html  ← plantilla de KPIs + gráfica (copia esta)
│   └── error.html
├── static/css/estilos.css  ← colores y maquetación
└── requirements.txt        ← dependencias Python
```

## 7. Errores comunes

| Síntoma | Causa / solución |
|---|---|
| «la hoja NO está compartida públicamente» | Comparte el Sheet como **«Cualquier persona con el enlace puede ver»** |
| «No existe la fuente `x`» | El `id` no coincide con `fuentes.yaml`, o está en `activa: false` |
| «El enlace no parece un Google Sheet» | La `url` no contiene `/spreadsheets/d/` — copia la URL completa del navegador |
| Cambié el enlace y veo datos viejos | La caché dura 5 min: reinicia `app.py` o llama a `POST /api/limpiar-cache` |
| Pestaña equivocada | Usa el campo `hoja:` con el nombre exacto de la pestaña (mayúsculas incluidas) |
| Errores de columnas | La primera fila de la hoja debe ser el encabezado (nombres de columna) |
| «No se pudo consultar la API de Google: … UNEXPECTED_EOF_WHILE_READING» | Fallo de red transitorio hacia `sheets.googleapis.com` (corte de TLS). El dashboard **reintenta solo** (3 intentos con backoff) y, si persiste, usa la última lista de pestañas guardada en `dashboard/.cache/`. Si nunca falla y aun así no carga, revisa VPN/antivirus y `POST /api/limpiar-cache` |
| La API key aparece en algún mensaje | No debería: `services/sheets.py` la redacta (`key=***`) en errores y logs. Si ves la clave real, **rótala** en Google Cloud y actualiza `dashboard/.env` |

### Fallos de red: reintentos y caché en disco

Las llamadas a Google (`services/sheets.py`) reintentan ante fallos transitorios
(SSL/timeout/conexión y HTTP 429/5xx): 3 intentos con esperas de 0,5 s y 1,5 s.
Los errores de configuración (401/403/404/400) **no** se reintentan: son
permanentes y hay que corregirlos.

Además, la lista de pestañas descubierta (`hojas: "*"`) se guarda en
`dashboard/.cache/pestanas-<id>.json` (TTL 24 h). Si la API no responde tras los
reintentos, el dashboard sirve esa lista en vez de mostrar un error, de modo que
la página sigue funcionando con datos algo más antiguos. Esa carpeta está en
`.gitignore`; en Vercel (sistema de archivos de sólo lectura) se ignora en
silencio.

## 8. Despliegue en Vercel (función Python)

El dashboard se despliega como **función serverless** dentro del mismo proyecto Vercel del ERP, bajo el prefijo `/dash`:

- `api/index.py` — wrapper WSGI que monta `dashboard/app.py` en `/dash`.
- `requirements.txt` (raíz del repo) — dependencias que Vercel instala.
- `vercel.json` — rewrites `/dash/:path*` → `/api/index`, y excluye `/dash` del `X-Frame-Options: DENY` para permitir el `<iframe>` same-origin.

El ERP embebe el dashboard con `<iframe src="/dash/">` (mismo origen → sin CORS ni CSP cross-origin). En local, `DashboardEmbedded.jsx` usa `http://127.0.0.1:5000` automáticamente.

## 9. Comandos útiles

```powershell
.venv\Scripts\python app.py                                  # arrancar
.venv\Scripts\python -m pip install -r requirements.txt      # dependencias
.venv\Scripts\python -c "from services.sheets import *; print(cargar_fuentes())"   # probar config
.venv\Scripts\python smoke.py                                # smoke de CI (sin red)
.venv\Scripts\python -m unittest discover -s . -p "test_*.py"   # tests (reintentos, redacción de la clave)
```
