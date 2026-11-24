"""Tests de la medición de servicio (`services/medicion.py`) y sus páginas.

Ejecutar desde `dashboard/`:

    .venv\\Scripts\\python -m unittest discover -s . -p "test_*.py"

No tocan la red: las filas son las que entrega `cargar_datos` (dict por fila
con `_pestaña`), copiadas de casos reales de la hoja.
"""

import unittest
from datetime import date
from unittest import mock

import app as app_modulo
from services import medicion as M


def fila(pestana="LINCE 2026", **valores):
    base = {
        "FECHA ENERO": "05-01-2026", "TIENDA": "LINCE", "ASESOR": "ST JOSUE",
        "TIPO DE VENTA": "SERVICIO", "CATEGORIA": "SERVICIO",
        "REPUESTO / ACCESORIO": "", "NOMBRE REPUESTO/ACCESORIO": "",
        "CANTIDAD": "1", "PRECIO UNITARIO": "", "MONTO": "",
        "EFECTIVO": "", "TARJETA DEBITO": "", "TARJETA CREDITO": "",
        "TRANSFERENCIA/YAPE/PLIN": "", "_pestaña": pestana,
    }
    base.update(valores)
    return base


class NormalizacionTests(unittest.TestCase):
    def test_numeros_con_formatos_de_la_hoja(self):
        self.assertEqual(M.a_numero("1,250.00"), 1250.0)
        self.assertEqual(M.a_numero("0050"), 50.0)
        self.assertEqual(M.a_numero("S/ 30"), 30.0)
        self.assertEqual(M.a_numero("12,5"), 12.5)
        self.assertIsNone(M.a_numero(""))

    def test_fechas_sin_anio_o_mal_tipeadas(self):
        self.assertEqual(M.a_fecha("14-03-2026"), date(2026, 3, 14))
        self.assertEqual(M.a_fecha("14/03"), date(2026, 3, 14))
        self.assertEqual(M.a_fecha("05-01-20226"), date(2026, 1, 5))
        self.assertEqual(M.a_fecha("05-01-26"), date(2026, 1, 5))
        self.assertIsNone(M.a_fecha("31-02-2026"))
        self.assertIsNone(M.a_fecha("FECHA FEBRERO"))

    def test_tecnico_sin_prefijo_st(self):
        self.assertEqual(M.normalizar_tecnico("ST KROSLAN"), "KROSLAN")
        self.assertEqual(M.normalizar_tecnico(" kroslan "), "KROSLAN")

    def test_variantes_de_un_mismo_servicio(self):
        for repuesto, nombre in [("REVISION 1", ""), ("", "REVISION # 1"), ("", "REVISION #1"),
                                 ("REVISION 1", "REV 1"), ("", "RVISION #1"), ("REVISION 1", "REVSION 1")]:
            self.assertEqual(M.clasificar_servicio(repuesto, nombre), ("Revisión 1", True), (repuesto, nombre))
        self.assertEqual(M.clasificar_servicio("", "MANTENIMEINTO")[0], "Mantenimiento")
        self.assertEqual(M.clasificar_servicio("INSTALACION", "LLANTA POST.")[0], "Cambio/instalación de llanta")
        self.assertEqual(M.clasificar_servicio("", "REVISION POR GARANTIA")[0], "Garantía")

    def test_servicio_nuevo_no_se_pierde(self):
        self.assertEqual(M.clasificar_servicio("PINTURA", "RETOQUE"), ("Otro: Pintura Retoque", False))
        self.assertEqual(M.clasificar_servicio("-", "SERVICIO TECNICO"), ("Sin detalle", False))


class EstandarizarTests(unittest.TestCase):
    def test_monto_vacio_usa_precio_o_pagos(self):
        filas = [
            fila(MONTO="135.00", **{"REPUESTO / ACCESORIO": "MANTENIMIENTO"}),
            fila(**{"PRECIO UNITARIO": "0050", "CANTIDAD": "2", "REPUESTO / ACCESORIO": "ACELERADOR"}),
            fila(EFECTIVO="30.00", **{"TRANSFERENCIA/YAPE/PLIN": "90.00"}),
            fila(MONTO="0.00", **{"REPUESTO / ACCESORIO": "REVISION 1"}),
        ]
        servicios, calidad = M.estandarizar(filas)
        self.assertEqual([s["monto"] for s in servicios], [135.0, 100.0, 120.0, 0.0])
        self.assertEqual([s["gratis"] for s in servicios], [False, False, False, True])
        self.assertEqual(calidad["sin_monto"], 0)

    def test_encabezados_distintos_por_sede_y_filtro_de_servicio(self):
        surco = {
            "FECHA ENERO": "03-01-2026", "ASESOR": "ST GOMER", "TIPO VENTA": "SERVICIO",
            "REPUESTO ACCESORIO": "", "NOMBRE REPUESTO": "MANTENIMIENTO", "MONTO": "50.00",
            "_pestaña": "SURCO 2026",
        }
        venta = fila(**{"TIPO DE VENTA": "VEHICULO", "MONTO": "3,300.00"})
        servicios, _ = M.estandarizar([surco, venta])
        self.assertEqual(len(servicios), 1)
        self.assertEqual(servicios[0]["sede"], "SURCO")
        self.assertEqual(servicios[0]["tecnico"], "GOMER")
        self.assertEqual(servicios[0]["servicio"], "Mantenimiento")
        self.assertEqual(servicios[0]["mes"], "01-Enero")

    def test_caracter_danado_en_nombre_se_unifica(self):
        servicios, _ = M.estandarizar([fila(ASESOR="JOSE"), fila(ASESOR="JOS�")])
        self.assertEqual({s["tecnico"] for s in servicios}, {"JOSE"})

    def test_resumen_separa_gratis_y_costo(self):
        servicios, _ = M.estandarizar([
            fila(MONTO="0.00", **{"REPUESTO / ACCESORIO": "GARANTIA"}),
            fila(MONTO="100.00", **{"REPUESTO / ACCESORIO": "MANTENIMIENTO"}),
            fila(MONTO="0.00", **{"REPUESTO / ACCESORIO": "MANTENIMIENTO"}),
        ])
        r = M.resumen(servicios)
        self.assertEqual((r["total"], r["gratis"], r["con_costo"], r["ingresos"]), (3, 2, 1, 100.0))
        tipos = {g["nombre"]: g["tipo"] for g in r["por_servicio"]}
        self.assertEqual(tipos, {"Garantía": "Gratis", "Mantenimiento": "Mixto"})


class PaginasMedicionTests(unittest.TestCase):
    def setUp(self):
        servicios, calidad = M.estandarizar([
            fila(MONTO="0.00", ASESOR="ST JOSUE", **{"REPUESTO / ACCESORIO": "REVISION 1"}),
            fila(MONTO="150.00", ASESOR="ST HECTOR", **{"REPUESTO / ACCESORIO": "BATERIA"}),
        ])
        mock.patch.object(app_modulo, "cargar_servicios", return_value=(servicios, calidad)).start()
        mock.patch.object(app_modulo, "fuente_por_id", return_value={"id": "servicio-tecnico"}).start()
        self.addCleanup(mock.patch.stopall)
        self.cliente = app_modulo.app.test_client()

    def test_las_tres_paginas_responden(self):
        for modo in ("medicion", "costo", "gratis"):
            resp = self.cliente.get(f"/dashboard/servicio-tecnico/{modo}")
            self.assertEqual(resp.status_code, 200, modo)
        self.assertEqual(self.cliente.get("/dashboard/servicio-tecnico/otro").status_code, 404)

    def test_filtro_por_tecnico_y_modo(self):
        html = self.cliente.get("/dashboard/servicio-tecnico/costo?tecnico=HECTOR").get_data(as_text=True)
        self.assertIn("S/ 150.00", html)
        html = self.cliente.get("/dashboard/servicio-tecnico/gratis").get_data(as_text=True)
        self.assertIn('<option value="JOSUE"', html)
        self.assertNotIn('<option value="HECTOR"', html)


if __name__ == "__main__":
    unittest.main()
