"""Función serverless de Vercel: sirve el dashboard Flask bajo `/dash`.

Vercel enruta `/dash/*` a este archivo (ver `vercel.json`). El dashboard real
vive en `dashboard/` **sin cambios**: este wrapper lo monta en el prefijo
`/dash` para que conviva con la SPA del ERP en el mismo dominio (mismo origen →
sin CORS, sin problemas de `frame-ancestors`, sin un segundo servicio).

Local sigue igual: `cd dashboard && .venv\\Scripts\\python app.py` expone el
dashboard en la raíz (`/`, `/dashboard/<id>`), y el ERP en dev apunta ahí.
"""

from __future__ import annotations

import os
import sys

# `dashboard/` en sys.path para poder importar `app` y `services.sheets`.
_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_RUTA_DASHBOARD = os.path.join(_BASE, "dashboard")
if _RUTA_DASHBOARD not in sys.path:
    sys.path.insert(0, _RUTA_DASHBOARD)

from app import app as _flask_app  # noqa: E402  (import tras ajustar sys.path)

PREFIJO = "/dash"


def _montar_en_prefijo(wsgi_app, prefijo: str):
    """WSGI middleware: mueve `prefijo` de PATH_INFO a SCRIPT_NAME.

    Así Flask sigue viendo rutas relativas (`/`, `/dashboard/<id>`, `/api/...`)
    y `url_for`/estáticos generan URLs correctas bajo `/dash`.
    """

    def middleware(environ, start_response):
        ruta = environ.get("PATH_INFO", "") or "/"
        if ruta == prefijo or ruta.startswith(prefijo + "/"):
            environ["SCRIPT_NAME"] = environ.get("SCRIPT_NAME", "") + prefijo
            environ["PATH_INFO"] = ruta[len(prefijo):] or "/"
        return wsgi_app(environ, start_response)

    return middleware


# Vercel carga este `app` (aplicación WSGI).
app = _montar_en_prefijo(_flask_app, PREFIJO)
