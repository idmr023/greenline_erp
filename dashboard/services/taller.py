"""Cliente de la API del backend (Express) para los módulos del taller.

El dashboard Flask muestra los datos VIVOS de los módulos del taller que el
panel admin registra en la base de datos del backend:

  · Evaluación de incentivos de armadores (`/taller/*`)
  · Registro de garantías (`/garantias`)
  · Reporte de ensamblado (`/ensamblado`)

Autenticación: el token del usuario llega desde el panel por `postMessage` y
el navegador lo envía al dashboard en la cabecera `X-GL-Token`; aquí se
reenvía al backend como `Authorization: Bearer`. Si no hay token, se usa
`TALLER_API_TOKEN` (env), que permite abrir el dashboard fuera del panel.

El token NUNCA va en la query string ni se escribe en los logs: los mensajes
de error lo redactan (`services.http.sin_clave`).
"""

from __future__ import annotations

import hashlib
import os
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode

from services.http import ErrorHttp, get_con_reintentos

# URL base de la API Express (la misma que usa el panel vía VITE_API_URL).
# Local: http://localhost:3000/api   ·   Producción: la del backend en Render.
API_TALLER = os.environ.get("TALLER_API_URL", "http://localhost:3000/api").rstrip("/")

# Cabecera por la que el navegador (dentro del iframe) entrega el token.
CABECERA_TOKEN = "X-GL-Token"

TTL_CACHE_SEGUNDOS = 60

_cache: dict[tuple, tuple[float, dict]] = {}


class TallerError(Exception):
    """Error al consultar los módulos del taller (mensaje apto para el usuario)."""


def limpiar_cache() -> None:
    _cache.clear()


def _token_de_ejecucion(token: str) -> str:
    """Token del usuario (cabecera) o, si no hay, el de servicio del entorno."""
    return (token or "").strip() or os.environ.get("TALLER_API_TOKEN", "").strip()


def _api(ruta: str, params: dict, token: str):
    """GET a un endpoint del backend con el token del usuario."""
    if not token:
        raise TallerError(
            "Inicia sesión en el panel para ver los datos del taller."
        )
    query = {k: v for k, v in (params or {}).items() if v not in (None, "")}
    url = f"{API_TALLER}{ruta}"
    if query:
        url = f"{url}?{urlencode(query)}"
    try:
        resp = get_con_reintentos(
            url,
            "No se pudo consultar la API del taller",
            cabeceras={"Authorization": f"Bearer {token}"},
        )
    except ErrorHttp as exc:
        raise TallerError(str(exc)) from exc

    if resp.status_code in (401, 403):
        raise TallerError(
            "Tu sesión no tiene permisos para ver los datos del taller "
            "(vuelve a iniciar sesión en el panel)."
        )
    if resp.status_code == 404:
        raise TallerError(f"El backend no expone {ruta}.")
    if resp.status_code != 200:
        raise TallerError(f"La API del taller respondió {resp.status_code}.")
    try:
        return resp.json()
    except ValueError as exc:
        raise TallerError("La API del taller devolvió una respuesta ilegible.") from exc


def datos_taller(mes: str = "", tienda_id: str = "", token: str = "") -> dict:
    """Agrega los datos de los módulos del taller para el mes/tienda indicados.

    `mes` es "YYYY-MM" (vacío = todos los meses) y `tienda_id` filtra por
    tienda (vacío = todas). Todas las consultas salen en paralelo y el
    resultado se cachea 60 s por (mes, tienda, token) para no machacar el
    backend en cada recarga de la página.
    """
    token = _token_de_ejecucion(token)
    if not token:
        raise TallerError("Inicia sesión en el panel para ver los datos del taller.")
    clave = (
        mes or "",
        tienda_id or "",
        hashlib.sha256(token.encode("utf-8")).hexdigest()[:12],
    )
    ahora = time.time()
    if clave in _cache:
        guardado, datos = _cache[clave]
        if ahora - guardado < TTL_CACHE_SEGUNDOS:
            return datos

    params = {"mes": mes, "tiendaId": tienda_id}
    llamadas = {
        "puntajes": ("/taller/puntajes", params),
        "evaluaciones": ("/taller/evaluaciones", params),
        "tecnicos": ("/taller/tecnicos", {}),
        "tiendas": ("/prestamos-vehiculo/tiendas", {}),
        "garantias": ("/garantias", params),
        "garantias_resumen": ("/garantias/resumen", params),
        "ensamblado": ("/ensamblado", params),
        "ensamblado_resumen": ("/ensamblado/resumen", params),
    }

    resultados: dict = {}
    errores: list[str] = []
    with ThreadPoolExecutor(max_workers=len(llamadas)) as pool:
        futuros = {
            nombre: pool.submit(_api, ruta, prm, token)
            for nombre, (ruta, prm) in llamadas.items()
        }
        for nombre, futuro in futuros.items():
            try:
                resultados[nombre] = futuro.result()
            except TallerError as exc:
                # Un mismo fallo suele repetirse en todos los módulos: se
                # informa una vez por mensaje distinto.
                mensaje = str(exc)
                if mensaje not in errores:
                    errores.append(mensaje)

    if not resultados:
        raise TallerError(
            "No se pudieron consultar los datos del taller. " + "; ".join(errores)
        )

    datos = {
        "mes": mes or "",
        "tiendaId": tienda_id or "",
        "puntajes": _puntajes(resultados.get("puntajes")),
        "evaluaciones": (resultados.get("evaluaciones") or {}).get("evaluaciones") or [],
        "tecnicos": (resultados.get("tecnicos") or {}).get("tecnicos") or [],
        "tiendas": (resultados.get("tiendas") or {}).get("tiendas") or [],
        "garantias": {
            "resumen": resultados.get("garantias_resumen") or {},
            "casos": (resultados.get("garantias") or {}).get("garantias") or [],
        },
        "ensamblado": {
            "resumen": resultados.get("ensamblado_resumen") or {},
            "registros": (resultados.get("ensamblado") or {}).get("registros") or [],
        },
        "errores": errores,
    }
    _cache[clave] = (ahora, datos)
    return datos


def _puntajes(bloque) -> dict:
    """Normaliza la respuesta de /taller/puntajes (total + puntajes + porTienda)."""
    bloque = bloque or {}
    return {
        "total": bloque.get("total") or 0,
        "puntajes": bloque.get("puntajes") or [],
        "porTienda": bloque.get("porTienda") or [],
    }
