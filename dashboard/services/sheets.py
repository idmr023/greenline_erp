"""Lector de fuentes de datos: Google Sheets públicos → filas de Python.

Todo lo relacionado con LEER las hojas vive aquí. Los dashboards que
programes sólo necesitan:

    from services.sheets import cargar_fuentes, cargar_datos

Flujo: `config/fuentes.yaml` (los enlaces) → URL pública CSV de Google →
lista de diccionarios [{columna: valor}, ...] con caché de 5 minutos.

Soporta dos modos por fuente:
  - UNA pestaña:  `hoja: "Nombre"`  (o sin `hoja` = la primera pestaña)
  - TODAS/las pestañas:  `hojas: "*"` (descubre vía API key de Google) o
    `hojas: ["Pestana1", "Pestana2"]` (lista explícita). En este modo cada
    fila lleva una columna extra `_pestaña` con el nombre de su pestaña.
"""

from __future__ import annotations

import csv
import io
import os
import re
import time
from pathlib import Path

import requests
import yaml

# Carga `dashboard/.env` en local (en Vercel las env vars ya vienen seteadas).
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # pragma: no cover - python-dotenv opcional
    pass

RUTA_FUENTES = Path(__file__).resolve().parent.parent / "config" / "fuentes.yaml"
TTL_CACHE_SEGUNDOS = 300
TIEMPO_ESPERA_SEGUNDOS = 20
PATRON_ID = re.compile(r"/spreadsheets/d/([a-zA-Z0-9-_]+)")
PATRON_GID = re.compile(r"[#&?]gid=(\d+)")

# Clave de Google Sheets API usada SÓLO para descubrir pestañas (`hojas: "*"`).
CLAVE_API = os.environ.get("GOOGLE_SHEETS_API_KEY", "")


class FuenteError(Exception):
    """Error de configuración o de lectura con mensaje apto para el usuario."""


_cache: dict[tuple[str, str], tuple[float, list[dict]]] = {}
_cache_pestanas: dict[str, tuple[float, list[str]]] = {}


def cargar_fuentes(solo_activas: bool = True) -> list[dict]:
    """Lee `config/fuentes.yaml` y devuelve la lista de fuentes configuradas."""
    if not RUTA_FUENTES.exists():
        raise FuenteError(f"No existe el archivo de enlaces: {RUTA_FUENTES}")
    with RUTA_FUENTES.open(encoding="utf-8") as fh:
        datos = yaml.safe_load(fh) or {}
    fuentes = datos.get("fuentes") or []
    if not isinstance(fuentes, list):
        raise FuenteError("fuentes.yaml debe contener una lista bajo la clave `fuentes:`")
    validadas = [_validar(f) for f in fuentes]
    if solo_activas:
        validadas = [f for f in validadas if f["activa"]]
    return validadas


def fuente_por_id(id_fuente: str, solo_activas: bool = True) -> dict:
    """Devuelve la fuente con ese `id`; lanza FuenteError si no existe."""
    for f in cargar_fuentes(solo_activas=solo_activas):
        if f["id"] == id_fuente:
            return f
    raise FuenteError(
        f"No existe la fuente `{id_fuente}`. Revisa config/fuentes.yaml "
        "(y que `activa: true`)."
    )


def _validar(fuente: dict) -> dict:
    if not isinstance(fuente, dict):
        raise FuenteError("Cada fuente de fuentes.yaml debe ser un bloque con `id`, `nombre` y `url`.")
    for campo in ("id", "nombre", "url"):
        if not fuente.get(campo):
            raise FuenteError(f"Falta el campo `{campo}` en una fuente de fuentes.yaml.")
    if not re.fullmatch(r"[a-z0-9_-]+", str(fuente["id"])):
        raise FuenteError(
            f"El id `{fuente['id']}` no es válido: usa minúsculas, números, guion o guion bajo."
        )
    hojas = _normalizar_hojas(fuente.get("hojas"))
    return {
        "id": str(fuente["id"]),
        "nombre": str(fuente["nombre"]),
        "url": str(fuente["url"]),
        "hoja": (str(fuente["hoja"]) if fuente.get("hoja") else None),
        "hojas": hojas,
        "activa": bool(fuente.get("activa", True)),
        "descripcion": str(fuente.get("descripcion") or ""),
    }


def _normalizar_hojas(valor) -> "str | list[str] | None":
    """Normaliza el campo `hojas`: `"*"` | lista de nombres | None."""
    if valor in (None, "", False):
        return None
    if isinstance(valor, str):
        v = valor.strip().lower()
        if v in ("*", "todas", "all"):
            return "*"
        return [valor]
    if isinstance(valor, list):
        limpias = [str(h) for h in valor if str(h).strip()]
        return limpias or None
    raise FuenteError("El campo `hojas` debe ser \"*\" o una lista de nombres de pestaña.")


def extraer_id_hoja(url: str) -> str:
    """Extrae el ID del documento desde su enlace de Google Sheets."""
    m = PATRON_ID.search(url or "")
    if not m:
        raise FuenteError(
            "El enlace no parece un Google Sheet. Debe verse como "
            "https://docs.google.com/spreadsheets/d/<ID>/edit"
        )
    return m.group(1)


def descubrir_pestanas(id_sheet: str, forzar: bool = False) -> list[str]:
    """Lista los títulos de las pestañas de un Sheet público vía API de Google.

    Requiere GOOGLE_SHEETS_API_KEY (API key con «Application restrictions: None»
    y «API restrictions: Google Sheets API»). El resultado se cachea 5 min.
    """
    if not CLAVE_API:
        raise FuenteError(
            "Falta GOOGLE_SHEETS_API_KEY para descubrir las pestañas. Crea una API key "
            "en Google Cloud (APIs & Services → Credentials → Create → API key) y ponla "
            "en dashboard/.env o en las Environment Variables de Vercel."
        )
    ahora = time.time()
    if not forzar and id_sheet in _cache_pestanas:
        guardado, pestanas = _cache_pestanas[id_sheet]
        if ahora - guardado < TTL_CACHE_SEGUNDOS:
            return pestanas

    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{id_sheet}"
        f"?key={CLAVE_API}&fields=sheets.properties(title)"
    )
    try:
        resp = requests.get(url, timeout=TIEMPO_ESPERA_SEGUNDOS)
    except requests.RequestException as exc:
        raise FuenteError(f"No se pudo consultar la API de Google: {exc}") from exc

    if resp.status_code in (401, 403):
        raise FuenteError(
            "La API de Google rechazó la consulta (401/403). Revisa que la API key tenga "
            "«Application restrictions: None» y «API restrictions: Google Sheets API», y que "
            "la Google Sheets API esté habilitada en el proyecto de Google Cloud."
        )
    if resp.status_code == 400:
        cuerpo = resp.text
        if "Office file" in cuerpo or "FAILED_PRECONDITION" in cuerpo:
            raise FuenteError(
                "Este archivo es un documento de Microsoft Office (Excel) subido a Drive, "
                "no un Google Sheet nativo, y la API no puede enumerar sus pestañas. "
                "Solución: ábrelo en Google Drive → Archivo → «Guardar como Google Sheets» "
                "(crea una copia nativa) y usa esa copia en fuentes.yaml. "
                "O bien, lista las pestañas a mano con `hojas: [\"Pestana1\", \"Pestana2\"]`."
            )
        raise FuenteError(f"La API de Google respondió 400: {cuerpo[:200]}")
    if resp.status_code == 404:
        raise FuenteError("La API de Google no encontró el Sheet: revisa el enlace.")
    if resp.status_code != 200:
        raise FuenteError(f"La API de Google respondió {resp.status_code}. Revisa la API key.")

    datos = resp.json()
    pestanas = [s["properties"]["title"] for s in datos.get("sheets", [])]
    if not pestanas:
        raise FuenteError("La API de Google no devolvió ninguna pestaña para ese Sheet.")
    _cache_pestanas[id_sheet] = (ahora, pestanas)
    return pestanas


def url_csv(fuente: dict, hoja: str | None = None) -> str:
    """URL pública CSV de una pestaña (sin credenciales: exige hoja compartida).

    `hoja` (opcional) indica la pestaña concreta; si se omite usa la definida
    en la fuente, o la primera pestaña.
    """
    id_hoja = extraer_id_hoja(fuente["url"])
    hoja_a_usar = hoja or fuente.get("hoja")
    if hoja_a_usar:
        return (
            f"https://docs.google.com/spreadsheets/d/{id_hoja}/gviz/tq"
            f"?tqx=out:csv&sheet={requests.utils.quote(hoja_a_usar)}"
        )
    gid = PATRON_GID.search(fuente["url"] or "")
    if gid:
        return f"https://docs.google.com/spreadsheets/d/{id_hoja}/export?format=csv&gid={gid.group(1)}"
    return f"https://docs.google.com/spreadsheets/d/{id_hoja}/gviz/tq?tqx=out:csv"


def _pestanas_de(fuente: dict) -> list[str | None]:
    """Determina las pestañas a leer. `None` = primera pestaña por defecto."""
    hojas = fuente.get("hojas")
    if hojas == "*":
        return descubrir_pestanas(extraer_id_hoja(fuente["url"]))
    if isinstance(hojas, list) and hojas:
        return hojas
    # Comportamiento original: UNA pestaña (la de `hoja` o la primera).
    return [fuente.get("hoja")]


def cargar_datos(fuente: dict, forzar: bool = False) -> list[dict]:
    """Devuelve las filas de la(s) pestaña(s) como lista de diccionarios (con caché).

    Si la fuente define `hojas` (lista o "*"), se leen varias pestañas y se unen;
    cada fila lleva además una columna `_pestaña` con el nombre de su pestaña.
    """
    hojas = fuente.get("hojas")
    if hojas is None:
        # Una sola pestaña, sin columna extra (compatibilidad con dashboards existentes).
        return _cargar_una(fuente, None, forzar)

    pestanas = _pestanas_de(fuente)
    filas_unidas: list[dict] = []
    for pestaña in pestanas:
        filas = _cargar_una(fuente, pestaña, forzar)
        for fila in filas:
            nueva = dict(fila)
            nueva["_pestaña"] = pestaña or "(primera)"
            filas_unidas.append(nueva)
    return filas_unidas


def _cargar_una(fuente: dict, hoja: str | None, forzar: bool) -> list[dict]:
    """Descarga (o sirve de caché) UNA pestaña concreta."""
    clave = (fuente["id"], hoja or fuente.get("hoja") or "")
    ahora = time.time()
    if not forzar and clave in _cache:
        guardado, filas = _cache[clave]
        if ahora - guardado < TTL_CACHE_SEGUNDOS:
            return filas

    filas = _descargar_csv(url_csv(fuente, hoja))
    _cache[clave] = (ahora, filas)
    return filas


def limpiar_cache() -> None:
    _cache.clear()
    _cache_pestanas.clear()


def _descargar_csv(url: str) -> list[dict]:
    try:
        resp = requests.get(url, timeout=TIEMPO_ESPERA_SEGUNDOS, headers={"User-Agent": "greenline-dashboard"})
    except requests.RequestException as exc:
        raise FuenteError(f"No se pudo conectar con Google Sheets: {exc}") from exc

    if resp.status_code in (401, 403):
        raise FuenteError(
            "Google rechazó la lectura (401/403). La hoja NO está compartida públicamente: "
            "en Google Sheets → Compartir → «Cualquier persona con el enlace puede ver»."
        )
    if resp.status_code == 404:
        raise FuenteError("Google no encontró la hoja: revisa que el enlace sea correcto.")
    if resp.status_code != 200:
        raise FuenteError(f"Google Sheets respondió {resp.status_code}. Revisa el enlace.")

    texto = resp.text.lstrip("\ufeff")
    if texto.lstrip()[:15].lower().startswith("<!doctype html") or texto.lstrip()[:5].lower().startswith("<html"):
        raise FuenteError(
            "Google devolvió una página de login en vez de datos: la hoja es privada. "
            "Compártela como «Cualquier persona con el enlace puede ver»."
        )
    if not texto.strip():
        return []

    lector = csv.DictReader(io.StringIO(texto))
    filas: list[dict] = []
    for fila in lector:
        limpia = {
            (k.strip() if k else f"col_{i}"): (v.strip() if isinstance(v, str) else v)
            for i, (k, v) in enumerate(fila.items())
        }
        filas.append(limpia)
    return filas
