"""Tests del dashboard: reintentos de red, redacciÃ³n de la API key y cachÃ©.

Ejecutar desde `dashboard/`:

    .venv\\Scripts\\python -m unittest discover -s . -p "test_*.py"

No tocan la red: `requests.get` se sustituye por un doble de prueba.
"""

import contextlib
import io
import json
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import requests

from services import http, sheets

CLAVE_DE_PRUEBA = "AIzaSyCLAVEdePRUEBA0000000000000000000"


class _RespuestaFalsa:
    """Doble mÃ­nimo de `requests.Response`."""

    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


class BaseHojas(unittest.TestCase):
    def setUp(self):
        self._clave = sheets.CLAVE_API
        self._directorio = sheets.DIRECTORIO_CACHE
        sheets.CLAVE_API = CLAVE_DE_PRUEBA
        sheets.DIRECTORIO_CACHE = Path(tempfile.mkdtemp(prefix="gl-cache-"))
        sheets.limpiar_cache()
        # Sin esperas reales entre reintentos.
        self._sleep = mock.patch.object(sheets.time, "sleep").start()
        self.addCleanup(mock.patch.stopall)
        self.addCleanup(shutil.rmtree, sheets.DIRECTORIO_CACHE, ignore_errors=True)

    def tearDown(self):
        sheets.CLAVE_API = self._clave
        sheets.DIRECTORIO_CACHE = self._directorio
        sheets.limpiar_cache()


class DescubrirPestanasTests(BaseHojas):
    def test_reintenta_tras_un_ssl_error(self):
        """Un corte de TLS no debe tumbar la pÃ¡gina: se reintenta."""
        llamadas = []

        def get_falso(url, **kwargs):
            llamadas.append(url)
            if len(llamadas) < 3:
                raise requests.exceptions.SSLError("UNEXPECTED_EOF_WHILE_READING")
            return _RespuestaFalsa(
                200, {"sheets": [{"properties": {"title": "PestaÃ±a 1"}}]}
            )

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            pestanas = sheets.descubrir_pestanas("SHEET_ID")

        self.assertEqual(pestanas, ["PestaÃ±a 1"])
        self.assertEqual(len(llamadas), 3)

    def test_el_error_final_no_expone_la_api_key(self):
        """La clave viaja en la URL: el mensaje de error debe ocultarla."""
        detalle = (
            "HTTPSConnectionPool(host='sheets.googleapis.com', port=443): "
            "Max retries exceeded with url: /v4/spreadsheets/ID"
            f"?key={CLAVE_DE_PRUEBA}&fields=sheets.properties(title)"
        )

        def get_falso(url, **kwargs):
            raise requests.exceptions.SSLError(detalle)

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            with self.assertRaises(sheets.FuenteError) as ctx:
                sheets.descubrir_pestanas("SHEET_ID")

        mensaje = str(ctx.exception)
        self.assertNotIn(CLAVE_DE_PRUEBA, mensaje)
        self.assertIn("key=***", mensaje)

    def test_el_log_de_reintentos_no_expone_la_api_key(self):
        """El log del servidor tampoco debe filtrar la clave."""
        detalle = (
            "Max retries exceeded with url: /v4/spreadsheets/ID"
            f"?key={CLAVE_DE_PRUEBA}&fields=sheets.properties(title)"
        )

        def get_falso(url, **kwargs):
            raise requests.exceptions.SSLError(detalle)

        salida = io.StringIO()
        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            with contextlib.redirect_stdout(salida):
                with self.assertRaises(sheets.FuenteError):
                    sheets.descubrir_pestanas("SHEET_ID")

        self.assertNotIn(CLAVE_DE_PRUEBA, salida.getvalue())
        self.assertIn("key=***", salida.getvalue())

    def test_no_reintenta_un_error_de_configuracion(self):
        """Un 400 (config/API key) es permanente: falla rÃ¡pido, sin 3 intentos."""
        llamadas = []

        def get_falso(url, **kwargs):
            llamadas.append(url)
            return _RespuestaFalsa(400, text='{"error": {"code": 400}}')

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            with self.assertRaises(sheets.FuenteError):
                sheets.descubrir_pestanas("SHEET_ID")

        self.assertEqual(len(llamadas), 1)

    def test_usa_la_cache_en_disco_si_la_api_falla(self):
        """Con la API caÃ­da, la Ãºltima lista de pestaÃ±as conocida salva la pÃ¡gina."""
        sheets._escribir_cache_pestanas("SHEET_ID", ["PestaÃ±a guardada"])

        def get_falso(url, **kwargs):
            raise requests.exceptions.SSLError("UNEXPECTED_EOF_WHILE_READING")

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            pestanas = sheets.descubrir_pestanas("SHEET_ID")

        self.assertEqual(pestanas, ["PestaÃ±a guardada"])

    def test_ignora_una_cache_en_disco_caducada(self):
        """Pasadas las 24 h, la cachÃ© deja de servir (pestaÃ±as desactualizadas)."""
        ruta = sheets._ruta_cache_pestanas("SHEET_ID")
        sheets.DIRECTORIO_CACHE.mkdir(parents=True, exist_ok=True)
        ruta.write_text(
            json.dumps({"ts": time.time() - 999999, "pestanas": ["Vieja"]}),
            encoding="utf-8",
        )

        def get_falso(url, **kwargs):
            raise requests.exceptions.SSLError("UNEXPECTED_EOF_WHILE_READING")

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            with self.assertRaises(sheets.FuenteError):
                sheets.descubrir_pestanas("SHEET_ID")

    def test_una_consulta_exitosa_guarda_la_cache_en_disco(self):
        with mock.patch.object(
            http.requests,
            "get",
            return_value=_RespuestaFalsa(
                200, {"sheets": [{"properties": {"title": "PestaÃ±a 1"}}]}
            ),
        ):
            sheets.descubrir_pestanas("SHEET_ID")

        self.assertEqual(sheets._leer_cache_pestanas("SHEET_ID"), ["PestaÃ±a 1"])


class DescargarCsvTests(BaseHojas):
    def test_reintenta_la_descarga_del_csv(self):
        llamadas = []

        def get_falso(url, **kwargs):
            llamadas.append(url)
            if len(llamadas) < 2:
                raise requests.exceptions.ConnectionError("connection reset")
            return _RespuestaFalsa(200, text='col_a,col_b\n1,2\n')

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            filas = sheets._descargar_csv("https://docs.google.com/x")

        self.assertEqual(filas, [{"col_a": "1", "col_b": "2"}])
        self.assertEqual(len(llamadas), 2)

    def test_error_de_csv_tras_agotar_los_intentos(self):
        def get_falso(url, **kwargs):
            raise requests.exceptions.SSLError("UNEXPECTED_EOF_WHILE_READING")

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            with self.assertRaises(sheets.FuenteError) as ctx:
                sheets._descargar_csv("https://docs.google.com/x")

        self.assertIn("No se pudo conectar con Google Sheets", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
