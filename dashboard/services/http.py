"""Capa HTTP compartida del dashboard: reintentos y redacción de secretos.

La usan los dos clientes de datos:
  · `services.sheets` → Google Sheets (CSV público + Sheets API).
  · `services.taller` → API Express del backend (módulos del taller).

Centraliza tres cosas:
  1. Los reintentos ante fallos TRANSITORIOS (SSL/timeout/conexión y HTTP
     429/5xx). Sin esto, un solo corte de conexión tumba la página.
  2. La redacción de secretos en los mensajes de error: la API key de Google
     viaja en la query (?key=AIza...) y el JWT del backend en la cabecera
     (Authorization: Bearer eyJ...). Ninguno debe aparecer en un error.
  3. El `User-Agent` de las llamadas.
"""

from __future__ import annotations

import re
import time

import requests

TIEMPO_ESPERA_SEGUNDOS = 12
MAX_INTENTOS = 3
BACKOFF_SEGUNDOS = (0.5, 1.5)
STATUS_REINTENTABLES = (429, 500, 502, 503, 504)
CABECERAS = {"User-Agent": "greenline-dashboard"}

# Secretos que pueden colarse en el texto de un error de `requests`:
#   · la API key de Google va en la query (?key=AIzaSy...)
#   · el JWT del backend va en la cabecera (Authorization: Bearer eyJ...)
PATRON_CLAVE = re.compile(r"(key=)[^&\s\"']+")
PATRON_BEARER = re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]+", re.IGNORECASE)


class ErrorHttp(Exception):
    """Fallo de red o de servicio, con mensaje apto para el usuario."""


def sin_clave(texto: str) -> str:
    """Oculta la API key de Google y el token del backend en un texto."""
    redactado = PATRON_CLAVE.sub(r"\1***", texto or "")
    return PATRON_BEARER.sub(r"\1***", redactado)


def get_con_reintentos(
    url: str,
    mensaje_error: str,
    cabeceras: dict | None = None,
    intentos: int = MAX_INTENTOS,
):
    """GET con reintentos ante fallos transitorios de red o de servidor.

    Reintenta los `requests.RequestException` (SSL/timeout/conexión) y los
    status 429/5xx; el resto de respuestas se devuelven tal cual para que las
    validaciones de cada endpoint emitan su mensaje específico. Si se agotan
    los intentos, lanza `ErrorHttp` con los secretos redactados.
    """
    cabeceras_final = {**CABECERAS, **(cabeceras or {})}
    detalle = "sin detalle"
    for intento in range(intentos):
        try:
            resp = requests.get(url, timeout=TIEMPO_ESPERA_SEGUNDOS, headers=cabeceras_final)
        except requests.RequestException as exc:
            detalle = str(exc)
        else:
            if resp.status_code not in STATUS_REINTENTABLES:
                return resp
            detalle = f"HTTP {resp.status_code}"
        if intento < intentos - 1:
            espera = BACKOFF_SEGUNDOS[min(intento, len(BACKOFF_SEGUNDOS) - 1)]
            print(
                f"[dashboard] fallo transitorio en la API "
                f"({sin_clave(detalle)[:80]}); reintento {intento + 2}/{intentos} en {espera}s",
                flush=True,
            )
            time.sleep(espera)
    raise ErrorHttp(f"{mensaje_error}: {sin_clave(detalle)}")
