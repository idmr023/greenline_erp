"""Smoke del dashboard Flask para CI (`python smoke.py` desde `dashboard/`).

Renderiza /dashboard/servicio-tecnico con datos simulados (sin red) y falla
si la ruta, el extractor o la plantilla rompen, o si falta la cabecera CSP
`frame-ancestors` que permite embeberlo en el ERP por <iframe>.
"""

import app as app_mod

app_mod.fuente_por_id = lambda fid: {"id": fid, "nombre": "Servicio Técnico (smoke)"}  # noqa: E731
app_mod.cargar_datos = lambda _fuente: [  # noqa: E731
    {"Sede / Tienda": "01-Lima", "N° Técnicos": "3",
     "Total Servicios (Columna G)": "10",
     "Prod. Promedio (OTs/Técnico/Día)": "1.5",
     "MTTR Promedio (Días)": "2", "Tasa FTF (%)": "90",
     "CSAT Promedio": "4.5", "Cumplimiento de Meta (%)": "100", "col_8": ""},
    {"Sede / Tienda": "TOTAL", "N° Técnicos": "3",
     "Total Servicios (Columna G)": "10",
     "Prod. Promedio (OTs/Técnico/Día)": "1.5",
     "MTTR Promedio (Días)": "2", "Tasa FTF (%)": "90",
     "CSAT Promedio": "4.5", "Cumplimiento de Meta (%)": "100", "col_8": ""},
    {"Sede / Tienda": "DESGLOSE POR TIPO DE SERVICIO", "N° Técnicos": "",
     "Total Servicios (Columna G)": "", "Prod. Promedio (OTs/Técnico/Día)": "",
     "MTTR Promedio (Días)": "", "Tasa FTF (%)": "",
     "CSAT Promedio": "", "Cumplimiento de Meta (%)": "", "col_8": ""},
    {"Sede / Tienda": "01-Lima", "N° Técnicos": "4",
     "Total Servicios (Columna G)": "3", "Prod. Promedio (OTs/Técnico/Día)": "2",
     "MTTR Promedio (Días)": "1", "Tasa FTF (%)": "95",
     "CSAT Promedio": "8", "Cumplimiento de Meta (%)": "80", "col_8": ""},
    {"Sede / Tienda": "MEDICION POR TECNICO", "N° Técnicos": "",
     "Total Servicios (Columna G)": "", "Prod. Promedio (OTs/Técnico/Día)": "",
     "MTTR Promedio (Días)": "", "Tasa FTF (%)": "",
     "CSAT Promedio": "", "Cumplimiento de Meta (%)": "", "col_8": ""},
    {"Sede / Tienda": "01-Lima", "N° Técnicos": "Juan Pérez",
     "Total Servicios (Columna G)": "Senior",
     "Prod. Promedio (OTs/Técnico/Día)": "5",
     "MTTR Promedio (Días)": "1.2", "Tasa FTF (%)": "2",
     "CSAT Promedio": "95", "Cumplimiento de Meta (%)": "4.8",
     "col_8": "Activo"},
]


def main() -> None:
    client = app_mod.app.test_client()
    r = client.get("/dashboard/servicio-tecnico")
    assert r.status_code == 200, f"status {r.status_code}: {r.data[:300]!r}"
    html = r.data.decode("utf-8")
    assert "01-Lima" in html, "la sede no aparece en el HTML"
    assert "Juan" in html, "el técnico no aparece en el HTML"
    csp = r.headers.get("Content-Security-Policy", "")
    assert "frame-ancestors" in csp, "falta CSP frame-ancestors para el <iframe>"
    print(f"dashboard smoke OK ({len(r.data)} bytes)")


if __name__ == "__main__":
    main()
