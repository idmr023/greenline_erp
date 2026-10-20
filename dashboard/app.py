"""Dashboard GreenLine — Google Sheets → Flask.

Arranque (desde la carpeta `dashboard/`):

    .venv\\Scripts\\python app.py      (Windows)
    .venv/bin/python app.py           (macOS/Linux)

y abre http://127.0.0.1:5000 (escucha en 0.0.0.0: también visible
desde la red Wi-Fi con la IP LAN de esta máquina, p. ej. http://192.168.1.50:5000)

Las fuentes de datos se configuran en `config/fuentes.yaml` (los enlaces).
Cada página de dashboard es una función con `@app.route`; ver README.md.
"""

from __future__ import annotations

import os
import re
import socket
from datetime import datetime

from flask import Flask, jsonify, render_template, abort, request
from urllib.parse import urlparse

from services.sheets import (
    FuenteError,
    cargar_datos,
    cargar_fuentes,
    fuente_por_id,
    limpiar_cache,
)
from services.taller import TallerError, datos_taller

app = Flask(__name__)

# Orígenes autorizados a embeber este dashboard en un <iframe> (el ERP).
# Por defecto: localhost + la IP LAN de esta máquina (para abrir el ERP desde
# otros dispositivos del Wi-Fi sin configurar nada). En producción define
# DASHBOARD_FRAME_ANCESTORS con la URL del panel.
# Ej.: "https://greenline-erp.onrender.com https://greenlineperu.com"
def _ip_lan() -> str | None:
    """IP de esta máquina en la red local (no envía tráfico: sólo elige la interfaz saliente)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip if ip and not ip.startswith("127.") else None
    except OSError:
        return None


def _ancestros_por_defecto() -> str:
    base = [
        "'self'",
        "http://localhost:5173", "http://localhost:5174",
        "http://127.0.0.1:5173", "http://127.0.0.1:5174",
        "https://greenlineperu.com",
    ]
    ip = _ip_lan()
    if ip:
        base.append(f"http://{ip}:5173")
        base.append(f"http://{ip}:5174")
    return " ".join(base)


def _origen_referente() -> str | None:
    """Origen de la página que embebe el dashboard (cabeceras Origin/Referer).

    Cubre el caso que la lista estática no puede: IPs/hostnames de red que
    cambian (Wi-Fi del local, hotspot del celular) o puertos no previstos.
    Sólo se usa cuando DASHBOARD_FRAME_ANCESTORS no está definido (desarrollo).
    """
    for valor in (request.headers.get("Origin"), request.referrer):
        if not valor:
            continue
        try:
            partes = urlparse(valor)
        except ValueError:
            continue
        if partes.scheme in ("http", "https") and partes.netloc:
            return f"{partes.scheme}://{partes.netloc}"
    return None


def _ancestros_efectivos() -> str:
    """frame-ancestors para esta petición.

    Producción: DASHBOARD_FRAME_ANCESTORS manda (lista explícita).
    Desarrollo: base localhost/LAN calculada en cada petición (la IP Wi-Fi
    puede cambiar entre arranques) + el origen que realmente está embebiendo.
    """
    fijos = os.environ.get("DASHBOARD_FRAME_ANCESTORS")
    if fijos:
        return fijos
    base = _ancestros_por_defecto()
    ref = _origen_referente()
    if ref and ref not in base:
        base = f"{base} {ref}"
    return base


def _origenes_aceptados() -> list[str]:
    """Orígenes desde los que el dashboard acepta el `postMessage` del token.

    Es la misma lista que usa la CSP `frame-ancestors`, con `'self'`
    resuelto al origen de la propia petición (el panel y el dashboard
    comparten origen en producción).
    """
    origenes: list[str] = []
    for item in _ancestros_efectivos().split():
        if item == "'self'":
            origenes.append(f"{request.scheme}://{request.host}")
        else:
            origenes.append(item)
    return origenes


@app.after_request
def _permitir_iframe(resp):
    # Permite embeber el dashboard sólo desde los orígenes del ERP.
    # No fijamos X-Frame-Options para no bloquear el <iframe> del panel.
    resp.headers["Content-Security-Policy"] = f"frame-ancestors {_ancestros_efectivos()}"
    resp.headers.pop("X-Frame-Options", None)
    return resp


@app.route("/healthz")
def healthz():
    return jsonify({"ok": True})


def _filas_y_columnas(fuente: dict) -> tuple[list[dict], list[str]]:
    filas = cargar_datos(fuente)
    columnas: list[str] = []
    for fila in filas:
        for clave in fila:
            if clave not in columnas:
                columnas.append(clave)
    return filas, columnas


def _es_numero(valor) -> bool:
    try:
        float(str(valor).replace(",", "."))
        return True
    except (TypeError, ValueError):
        return False


def _a_numero(valor) -> float:
    try:
        v = str(valor).replace(",", ".").replace("%", "").strip()
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _extraer_servicio_tecnico(filas: list[dict]) -> dict:
    """Extrae las secciones apiladas de la pestaña 'Servicios Tecnico 2026'.

    La hoja tiene 3 secciones con encabezados distintos apiladas verticalmente:
      1) Resumen por sede (sede, técnicos, servicios, prod, MTTR, FTF, cumplimiento)
      2) Desglose de tipos de servicio por sede
      3) Rendimiento por técnico (nombre, nivel, métricas, estado)
    """
    sedes: list[dict] = []
    tipos: list[dict] = []
    tecnicos: list[dict] = []
    totales: dict = {}

    # Columnas CSV nombradas según la fila 0 de la hoja
    C_SEDE = "Sede / Tienda"
    C_B = "N° Técnicos"
    C_C = "Total Servicios (Columna G)"
    C_D = "Prod. Promedio (OTs/Técnico/Día)"
    C_E = "MTTR Promedio (Días)"
    C_F = "Tasa FTF (%)"
    C_G = "CSAT Promedio"
    C_H = "Cumplimiento de Meta (%)"
    C_I = "col_8"

    seccion = "sedes"
    for fila in filas:
        titulo = (fila.get(C_SEDE) or "").strip()
        if not titulo:
            continue
        mayus = titulo.upper()
        if "DESGLOSE" in mayus:
            seccion = "tipos"
            continue
        if "MEDICION" in mayus:
            seccion = "tecnicos"
            continue
        if "PLANTILLA" in mayus:
            seccion = None
            continue

        if seccion == "sedes":
            if titulo.startswith(("01-", "02-", "03-", "04-", "05-", "06-", "07-")):
                sedes.append({
                    "sede": titulo,
                    "tecnicos": int(_a_numero(fila.get(C_B))),
                    "servicios": int(_a_numero(fila.get(C_C))),
                    "prod": round(_a_numero(fila.get(C_D)), 2),
                    "mttr": round(_a_numero(fila.get(C_E)), 2),
                    "ftf": round(_a_numero(fila.get(C_F)), 1),
                    "cumplimiento": round(_a_numero(fila.get(C_H)), 1),
                })
            elif mayus.startswith("TOTAL"):
                totales = {
                    "tecnicos": int(_a_numero(fila.get(C_B))),
                    "servicios": int(_a_numero(fila.get(C_C))),
                    "prod": round(_a_numero(fila.get(C_D)), 2),
                    "mttr": round(_a_numero(fila.get(C_E)), 2),
                    "ftf": round(_a_numero(fila.get(C_F)), 1),
                    "cumplimiento": round(_a_numero(fila.get(C_H)), 1),
                }

        elif seccion == "tipos":
            if titulo.startswith(("01-", "02-", "03-", "04-", "05-", "06-", "07-")):
                tipos.append({
                    "sede": titulo,
                    "preventivo": int(_a_numero(fila.get(C_B))),
                    "diagnostico": int(_a_numero(fila.get(C_C))),
                    "col3": int(_a_numero(fila.get(C_D))),
                    "col4": int(_a_numero(fila.get(C_E))),
                    "col5": int(_a_numero(fila.get(C_F))),
                    "total": int(_a_numero(fila.get(C_G))),
                    "pct": round(_a_numero(fila.get(C_H)), 1),
                })

        elif seccion == "tecnicos":
            if titulo.startswith(("01-", "02-", "03-", "04-", "05-", "06-", "07-")):
                tecnicos.append({
                    "sede": titulo,
                    "nombre": (fila.get(C_B) or "").strip(),
                    "nivel": (fila.get(C_C) or "").strip(),
                    "ots": int(_a_numero(fila.get(C_D))),
                    "prod_dia": round(_a_numero(fila.get(C_E)), 2),
                    "mttr": round(_a_numero(fila.get(C_F)), 2),
                    "ftf": round(_a_numero(fila.get(C_G)), 1),
                    "csat": round(_a_numero(fila.get(C_H)), 1),
                    "estado": (fila.get(C_I) or "").strip(),
                })

    return {"sedes": sedes, "tipos": tipos, "tecnicos": tecnicos, "totales": totales}


def _kpi_ejemplo(filas: list[dict], columnas: list[str]) -> dict:
    numéricas = [c for c in columnas if filas and all(_es_numero(f.get(c)) or f.get(c) in (None, "") for f in filas[:25])]
    textuales = [c for c in columnas if c not in numéricas]
    resumen = {
        "filas": len(filas),
        "columnas": len(columnas),
        "numericas": numéricas,
        "textuales": textuales,
        "totales": {c: round(sum(_a_numero(f.get(c)) for f in filas), 2) for c in numéricas[:4]},
    }
    if textuales and numéricas:
        col_t, col_n = textuales[0], numéricas[0]
        acumulado: dict[str, float] = {}
        for f in filas:
            clave = str(f.get(col_t) or "(vacío)")
            acumulado[clave] = acumulado.get(clave, 0.0) + _a_numero(f.get(col_n))
        top = sorted(acumulado.items(), key=lambda kv: kv[1], reverse=True)[:10]
        resumen["grafica"] = {
            "titulo": f"Top {col_t} por suma de {col_n}",
            "etiquetas": [k for k, _ in top],
            "valores": [round(v, 2) for _, v in top],
        }
    return resumen


@app.route("/")
def index():
    try:
        fuentes = cargar_fuentes()
    except FuenteError as exc:
        return render_template("error.html", mensaje=str(exc)), 500
    return render_template("index.html", fuentes=fuentes)


@app.route("/api/fuentes")
def api_fuentes():
    try:
        return jsonify({"fuentes": cargar_fuentes()})
    except FuenteError as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/datos/<id_fuente>")
def api_datos(id_fuente: str):
    try:
        fuente = fuente_por_id(id_fuente)
        filas, columnas = _filas_y_columnas(fuente)
        return jsonify({"fuente": fuente, "columnas": columnas, "filas": filas})
    except FuenteError as exc:
        return jsonify({"error": str(exc)}), 404 if "No existe la fuente" in str(exc) else 502


@app.route("/api/limpiar-cache", methods=["POST"])
def api_limpiar_cache():
    limpiar_cache()
    return jsonify({"ok": True})


@app.route("/api/taller/datos")
def api_taller_datos():
    """Datos vivos de los módulos del taller (incentivos, garantías, ensamblado).

    El token del usuario llega en la cabecera `X-GL-Token` (lo manda el panel
    al iframe por postMessage). Sin token se usa `TALLER_API_TOKEN` del entorno.
    """
    mes = (request.args.get("mes") or "").strip()
    if mes and not re.fullmatch(r"\d{4}-\d{2}", mes):
        return jsonify({"error": "El mes debe tener el formato YYYY-MM."}), 400
    tienda_id = (request.args.get("tiendaId") or "").strip()
    token = request.headers.get("X-GL-Token", "")
    try:
        return jsonify(datos_taller(mes=mes, tienda_id=tienda_id, token=token))
    except TallerError as exc:
        return jsonify({"error": str(exc)}), 502


@app.route("/dashboard/servicio-tecnico")
def dashboard_servicio_tecnico():
    try:
        fuente = fuente_por_id("servicio-tecnico")
        filas = cargar_datos(fuente)
    except FuenteError as exc:
        return render_template("error.html", mensaje=str(exc)), 502
    datos = _extraer_servicio_tecnico(filas)
    if not datos["sedes"]:
        abort(404, description="No se encontraron datos de sedes en la pestaña «Servicios Tecnico 2026».")
    return render_template(
        "servicio_tecnico.html",
        fuente=fuente,
        sedes=datos["sedes"],
        tipos=datos["tipos"],
        tecnicos=datos["tecnicos"],
        totales=datos["totales"],
        origenes_aceptados=_origenes_aceptados(),
        generado=datetime.now().strftime("%d/%m/%Y %H:%M"),
    )


@app.route("/dashboard/<id_fuente>")
def dashboard_ejemplo(id_fuente: str):
    try:
        fuente = fuente_por_id(id_fuente)
        filas, columnas = _filas_y_columnas(fuente)
    except FuenteError as exc:
        return render_template("error.html", mensaje=str(exc)), 502
    if not filas:
        abort(404, description="La hoja está vacía.")
    kpis = _kpi_ejemplo(filas, columnas)
    return render_template(
        "dashboard_ejemplo.html",
        fuente=fuente,
        columnas=columnas,
        filas=filas[:50],
        kpis=kpis,
        generado=datetime.now().strftime("%d/%m/%Y %H:%M"),
    )


@app.errorhandler(FuenteError)
def _error_fuente(exc: FuenteError):
    return render_template("error.html", mensaje=str(exc)), 502


if __name__ == "__main__":
    # Local + red Wi-Fi: 0.0.0.0 expone el dashboard a otros dispositivos de la
    # red (el ERP lo embebe por <iframe>). Producción (Render): gunicorn lo
    # sirve vía `gunicorn app:app`; aquí respetamos HOST/PORT/FLASK_DEBUG.
    # OJO: si HOST llega como 127.0.0.1 (heredado de la terminal), la red LAN
    # recibe "rechazó la conexión" aunque el log parezca normal.
    _host = os.environ.get("HOST", "0.0.0.0")
    _port = int(os.environ.get("PORT", "5000"))
    _debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    _lan = _ip_lan()
    print(f"[dashboard] escuchando en {_host}:{_port} (LAN: http://{_lan}:{_port}/)", flush=True)
    if _host in ("127.0.0.1", "localhost"):
        print(
            "[dashboard] AVISO: HOST es loopback; otros dispositivos de la red "
            "NO podrán conectar. Relanza con HOST=0.0.0.0",
            flush=True,
        )
    app.run(host=_host, port=_port, debug=_debug)
