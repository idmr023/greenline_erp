"""Tests del cliente de los módulos del taller (`services/taller.py`).

Ejecutar desde `dashboard/`:

    .venv\\Scripts\\python -m unittest discover -s . -p "test_*.py"

No tocan la red: `requests.get` se sustituye por un doble de prueba.
"""

import unittest
from unittest import mock

from services import http, taller


class _RespuestaFalsa:
    """Doble mínimo de `requests.Response`."""

    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload


class BaseTaller(unittest.TestCase):
    def setUp(self):
        taller.limpiar_cache()
        self._sleep = mock.patch.object(http.time, "sleep").start()
        self.addCleanup(mock.patch.stopall)

    def tearDown(self):
        taller.limpiar_cache()


class DatosTallerTests(BaseTaller):
    def test_agrega_los_modulos_del_taller(self):
        """Una llamada por módulo y un JSON con todo agregado."""
        vistas = {}

        def get_falso(url, **kwargs):
            vistas[url] = kwargs.get("headers") or {}
            if "/taller/puntajes" in url:
                return _RespuestaFalsa(200, {
                    "total": 2,
                    "puntajes": [{"tecnicoId": "t1", "nombre": "Mario", "general": 80,
                                  "evaluaciones": 2, "tiendas": []}],
                    "porTienda": [{"id": "s1", "nombre": "01-Lima", "tecnicos": ["Mario"],
                                   "evaluaciones": 2}],
                })
            if "/taller/evaluaciones" in url:
                return _RespuestaFalsa(200, {"evaluaciones": [{"id": "e1", "puntaje": 5}]})
            if "/taller/tecnicos" in url:
                return _RespuestaFalsa(200, {"tecnicos": [{"id": "t1", "nombre": "Mario"}]})
            if "/prestamos-vehiculo/tiendas" in url:
                return _RespuestaFalsa(200, {"tiendas": [{"id": "s1", "nombre": "01-Lima"}]})
            if "/garantias/resumen" in url:
                return _RespuestaFalsa(200, {"total": 1, "porEstado": [{"estado": "REGISTRADA", "count": 1}]})
            if "/garantias" in url:
                return _RespuestaFalsa(200, {"garantias": [{"id": "g1", "correlativo": "G-001"}]})
            if "/ensamblado/resumen" in url:
                return _RespuestaFalsa(200, {"total": 3, "porEstado": [], "porMes": [],
                                             "porTienda": [], "porTecnico": []})
            if "/ensamblado" in url:
                return _RespuestaFalsa(200, {"registros": [{"id": "a1"}]})
            raise AssertionError(f"URL inesperada: {url}")

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            datos = taller.datos_taller(mes="2026-10", token="jwt-de-prueba")

        self.assertEqual(datos["puntajes"]["total"], 2)
        self.assertEqual(datos["puntajes"]["puntajes"][0]["nombre"], "Mario")
        self.assertEqual(len(datos["evaluaciones"]), 1)
        self.assertEqual(datos["tecnicos"][0]["id"], "t1")
        self.assertEqual(datos["tiendas"][0]["id"], "s1")
        self.assertEqual(datos["garantias"]["resumen"]["total"], 1)
        self.assertEqual(datos["garantias"]["casos"][0]["correlativo"], "G-001")
        self.assertEqual(datos["ensamblado"]["resumen"]["total"], 3)
        self.assertEqual(datos["errores"], [])
        # El token viaja en la cabecera Authorization, nunca en la query.
        self.assertTrue(all("token" not in url for url in vistas))
        self.assertTrue(all(h.get("Authorization") == "Bearer jwt-de-prueba" for h in vistas.values()))

    def test_sin_token_avisa_en_vez_de_fallar(self):
        with mock.patch.object(taller.os.environ, "get", return_value=""):
            with self.assertRaises(taller.TallerError) as ctx:
                taller.datos_taller(mes="2026-10", token="")
        self.assertIn("Inicia sesión en el panel", str(ctx.exception))

    def test_401_explica_los_permisos(self):
        def get_falso(url, **kwargs):
            return _RespuestaFalsa(401, {})

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            with self.assertRaises(taller.TallerError) as ctx:
                taller.datos_taller(mes="2026-10", token="jwt")
        self.assertIn("permisos", str(ctx.exception))

    def test_el_token_no_aparece_en_el_error(self):
        def get_falso(url, **kwargs):
            raise http.requests.exceptions.SSLError(
                "Max retries exceeded with url: /api/taller/puntajes"
            )

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            with self.assertRaises(taller.TallerError) as ctx:
                taller.datos_taller(mes="2026-10", token="jwt-secreto")
        self.assertNotIn("jwt-secreto", str(ctx.exception))

    def test_la_cache_evita_repetir_las_consultas(self):
        llamadas = []

        def get_falso(url, **kwargs):
            llamadas.append(url)
            return _RespuestaFalsa(200, {"total": 0, "puntajes": [], "porTienda": [],
                                          "evaluaciones": [], "tecnicos": [], "tiendas": [],
                                          "garantias": [], "porEstado": [],
                                          "registros": [], "porMes": [], "porTienda": [],
                                          "porTecnico": []})

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            taller.datos_taller(mes="2026-10", token="jwt")
            primer_turno = len(llamadas)
            taller.datos_taller(mes="2026-10", token="jwt")
            self.assertEqual(len(llamadas), primer_turno)

    def test_una_peticion_rota_no_tira_el_resto(self):
        """Si un módulo falla, los demás se muestran igual (con avisos)."""

        def get_falso(url, **kwargs):
            if "/garantias" in url:
                raise http.requests.exceptions.ConnectionError("boom")
            return _RespuestaFalsa(200, {"total": 0, "puntajes": [], "porTienda": [],
                                          "evaluaciones": [], "tecnicos": [], "tiendas": [],
                                          "garantias": [], "porEstado": [],
                                          "registros": [], "porMes": [], "porTienda": [],
                                          "porTecnico": []})

        with mock.patch.object(http.requests, "get", side_effect=get_falso):
            datos = taller.datos_taller(mes="2026-10", token="jwt")

        self.assertTrue(datos["errores"])
        self.assertIn("puntajes", datos)  # los demás módulos siguen llegando
        self.assertTrue(any("taller" in e for e in datos["errores"]))


class RouteTallerTests(unittest.TestCase):
    """La ruta /api/taller/datos responde como debe."""

    def setUp(self):
        import app as app_mod

        self.app_mod = app_mod
        self.cliente = app_mod.app.test_client()

    def test_sin_token_responde_con_error_amigable(self):
        resp = self.cliente.get("/api/taller/datos?mes=2026-10")
        self.assertEqual(resp.status_code, 502)
        self.assertIn("error", resp.get_json())

    def test_mes_invalido_responde_400(self):
        resp = self.cliente.get("/api/taller/datos?mes=octubre")
        self.assertEqual(resp.status_code, 400)

    def test_con_token_devuelve_los_datos(self):
        with mock.patch.object(
            self.app_mod,
            "datos_taller",
            return_value={"mes": "2026-10", "puntajes": {"total": 0, "puntajes": [], "porTienda": []}},
        ) as called:
            resp = self.cliente.get(
                "/api/taller/datos?mes=2026-10&tiendaId=s1",
                headers={"X-GL-Token": "jwt"},
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["mes"], "2026-10")
        self.assertEqual(called.call_args.kwargs["mes"], "2026-10")
        self.assertEqual(called.call_args.kwargs["tienda_id"], "s1")
        self.assertEqual(called.call_args.kwargs["token"], "jwt")


if __name__ == "__main__":
    unittest.main()
