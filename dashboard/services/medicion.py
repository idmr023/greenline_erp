"""Medición de Servicio por Sede y Técnico 2026.

Lee las pestañas de cada sede ("LINCE 2026", "SURCO 2026", ...) del Sheet
`servicio-tecnico` y estandariza las filas de servicio antes de agregarlas.

Las pestañas se llenan a mano y cada sede escribe distinto, así que aquí se
normaliza todo lo que rompía la lectura:
  - encabezados con espacios, saltos de línea o el mes pegado ("FECHA ENERO");
  - técnico con y sin prefijo "ST " ("ST KROSLAN" / "KROSLAN");
  - servicio escrito libre ("REVISION #1", "REV 1", "MANTENIMEINTO") en la
    columna de repuesto o en la de nombre, según la sede;
  - monto vacío (fila nueva sin fórmula) o como texto ("0050", "1,250.00"):
    se usa MONTO, si no PRECIO x CANTIDAD, si no la suma de los medios de pago;
  - fechas "dd-mm-aaaa", "dd/mm/aaaa", "dd/mm" (sin año), "dd-mm-aa".

Un servicio que no encaja en ninguna regla NO se pierde: entra como
"Otro: <texto>" y aparece en el bloque de calidad para añadir su regla.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date
from difflib import get_close_matches

from services.sheets import cargar_datos, descubrir_pestanas, extraer_id_hoja

ANIO = 2026
PATRON_PESTANA_SEDE = re.compile(rf"^(.+?)\s+{ANIO}\s*$", re.IGNORECASE)
PESTANAS_EXCLUIDAS = {"SERVICIOS TECNICO"}

MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
         "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

# Columna canónica -> prefijos aceptados del encabezado ya normalizado.
COLUMNAS = {
    "fecha": ("FECHA", "COLUMNA 1"),
    "asesor": ("ASESOR",),
    "tipo_venta": ("TIPO VENTA", "TIPO DE VENTA"),
    "categoria": ("CATEGORIA",),
    "modelo": ("MODELO VEHICULO",),
    "repuesto": ("REPUESTO ACCESORIO", "REPUESTO / ACCESORIO"),
    "nombre": ("NOMBRE REPUESTO",),
    "cantidad": ("CANTIDAD",),
    "precio": ("PRECIO UNITARIO",),
    "monto": ("MONTO",),
    "efectivo": ("EFECTIVO",),
    "debito": ("TARJETA DEBITO",),
    "credito": ("TARJETA CREDITO",),
    "transferencia": ("TRANSFERENCIA",),
}

# Orden = prioridad. Se evalúa sobre "REPUESTO + NOMBRE" ya normalizado.
REGLAS_SERVICIO = [
    (r"GARANT", "Garantía"),
    (r"MULTIPLE", "Servicio múltiple"),
    (r"\bREV\w*\s*(N|NRO|NO)?\s*[#°º.]?\s*1\b", "Revisión 1"),
    (r"\bREV\w*\s*(N|NRO|NO)?\s*[#°º.]?\s*2\b", "Revisión 2"),
    (r"\bREV\w*\s*(N|NRO|NO)?\s*[#°º.]?\s*3\b", "Revisión 3"),
    (r"CHOQUE", "Revisión por choque"),
    (r"ELECT", "Revisión eléctrica"),
    (r"\bMANT", "Mantenimiento"),
    (r"LLANTA|NEUMATIC|CAMARA", "Cambio/instalación de llanta"),
    (r"BATER|\bBAT\b", "Batería"),
    (r"ACELERADOR", "Acelerador"),
    (r"PITON", "Pitón"),
    (r"CONTROLADOR", "Controlador"),
    (r"ZAPATA|PASTILLA|FRENO", "Frenos"),
    (r"\bARO\b", "Aro"),
    (r"HORQUILLA|AMORTIGU|SUSPENSION", "Suspensión"),
    (r"PLASTICO|CARENAD", "Plásticos"),
    (r"ESPEJO", "Espejos"),
    (r"\bLLAV\w*\s*T", "Llave térmica"),
    (r"ALARMA", "Alarma"),
    (r"MOTOR", "Motor"),
    (r"PANTALLA|CABLE|FUSIBLE|RAMAL|PUERTO DE CARGA|CARGADOR|MANDO", "Sistema eléctrico"),
    (r"CALIPER", "Frenos"),
    (r"CHAPA|MANIJA|ESPALDAR|RESPALDAR|CAJUELA|GUARDAFANGO", "Carrocería y accesorios"),
    (r"RODAJE", "Rodajes"),
    (r"SOLDADURA", "Soldadura"),
    (r"PARCHADO", "Cambio/instalación de llanta"),
    (r"LIMPIEZA|LAVADO", "Limpieza"),
    (r"AJUSTE", "Ajuste"),
    (r"DIAGNOST|TESTEO|\bTEST\b", "Diagnóstico"),
    (r"REPARACION", "Reparación"),
    (r"\bREV", "Revisión general"),
    (r"INSTALACION", "Instalación"),
]
_REGLAS = [(re.compile(p), etiqueta) for p, etiqueta in REGLAS_SERVICIO]
VACIOS = {"", "-", "--", "N/A", "NA", "SERVICIO", "SERVICIO TECNICO", "S/N"}
# Palabras que se corrigen por similitud ("MANTENIMEINTO", "RVISION", "TEXTEO").
VOCABULARIO = [
    "MANTENIMIENTO", "REVISION", "GARANTIA", "BATERIA", "LLANTA", "ACELERADOR",
    "INSTALACION", "REPARACION", "CONTROLADOR", "MULTIPLE", "ELECTRICO", "CHOQUE",
    "HORQUILLA", "LIMPIEZA", "DIAGNOSTICO", "ESPEJOS", "PLASTICOS", "ZAPATAS",
    "TERMICA", "ALARMA", "TESTEO", "SOLDADURA", "PARCHADO",
]


def normalizar_texto(valor) -> str:
    """Mayúsculas, sin tildes, sin espacios repetidos. Conserva U+FFFD."""
    texto = unicodedata.normalize("NFKD", str(valor or ""))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", texto).strip().upper()


def a_numero(valor) -> float | None:
    """'1,250.00' -> 1250.0 · '0050' -> 50.0 · 'S/ 30' -> 30.0 · '' -> None."""
    texto = re.sub(r"[^\d,.\-]", "", str(valor or ""))
    if not re.search(r"\d", texto):
        return None
    if "," in texto and "." in texto:
        texto = texto.replace(",", "")
    elif "," in texto:
        texto = texto.replace(",", "." if re.search(r",\d{1,2}$", texto) else "")
    try:
        return float(texto)
    except ValueError:
        return None


def a_fecha(valor) -> date | None:
    """dd-mm-aaaa, dd/mm/aaaa, dd-mm-aa y dd/mm. La hoja es de 2026: el año
    escrito se ignora (aparece omitido o mal tipeado, p. ej. '20226')."""
    m = re.match(r"^\s*(\d{1,2})[-/.](\d{1,2})(?:[-/.]\d{2,5})?\s*$", str(valor or ""))
    if not m:
        return None
    try:
        return date(ANIO, int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def normalizar_tecnico(valor) -> str:
    """'ST KROSLAN' / 'kroslan ' -> 'KROSLAN'."""
    texto = normalizar_texto(valor)
    texto = re.sub(r"^(ST|S\.T\.?|TEC\.?|TECNICO)\s+", "", texto)
    return texto


def corregir_tipeo(texto: str) -> str:
    """Reemplaza cada palabra de 5+ letras por la del vocabulario más parecida (>= 80 %)."""
    def corregir(m):
        palabra = m.group(0)
        if palabra in VOCABULARIO:
            return palabra
        parecida = get_close_matches(palabra, VOCABULARIO, n=1, cutoff=0.8)
        return parecida[0] if parecida else palabra
    return re.sub(r"[A-Z]{5,}", corregir, texto)


def clasificar_servicio(repuesto, nombre) -> tuple[str, bool]:
    """Devuelve (servicio canónico, reconocido)."""
    tipo = normalizar_texto(repuesto)
    detalle = normalizar_texto(nombre)
    tipo = "" if tipo in VACIOS else tipo
    detalle = "" if detalle in VACIOS else detalle
    texto = corregir_tipeo(f"{tipo} {detalle}".strip())
    if not texto:
        return "Sin detalle", False
    for patron, etiqueta in _REGLAS:
        if patron.search(texto):
            return etiqueta, True
    return f"Otro: {texto.title()}", False


def _mapa_columnas(fila: dict) -> dict[str, str]:
    """Columna canónica -> clave real de la fila (la primera que coincida)."""
    mapa: dict[str, str] = {}
    for clave in fila:
        if clave.startswith("_"):
            continue
        norm = normalizar_texto(clave).replace("#", "").strip()
        for canonica, prefijos in COLUMNAS.items():
            if canonica not in mapa and any(norm.startswith(p) for p in prefijos):
                mapa[canonica] = clave
                break
    return mapa


def _monto(fila: dict, cols: dict) -> tuple[float, bool]:
    """(monto, registrado). registrado=False si la fila no trae ningún importe."""
    def valor(nombre):
        return a_numero(fila.get(cols[nombre])) if nombre in cols else None

    monto = valor("monto")
    if monto is not None:
        return monto, True
    precio = valor("precio")
    if precio is not None:
        return precio * (valor("cantidad") or 1), True
    pagos = [valor(n) for n in ("efectivo", "debito", "credito", "transferencia")]
    pagos = [p for p in pagos if p is not None]
    if pagos:
        return sum(pagos), True
    return 0.0, False


def _unificar_tecnicos(servicios: list[dict]) -> None:
    """'JOS�' (carácter dañado en la hoja) -> 'JOSE' si existe ese técnico."""
    conocidos = {s["tecnico"] for s in servicios if "�" not in s["tecnico"]}
    for s in servicios:
        if "�" in s["tecnico"]:
            patron = re.compile("^" + re.escape(s["tecnico"]).replace("�", ".") + "$")
            candidatos = [c for c in conocidos if patron.match(c)]
            s["tecnico"] = candidatos[0] if len(candidatos) == 1 else s["tecnico"].replace("�", "?")


def estandarizar(filas: list[dict]) -> tuple[list[dict], dict]:
    """Filas crudas (con `_pestaña`) -> (servicios estandarizados, reporte de calidad)."""
    servicios: list[dict] = []
    calidad = {"sin_fecha": 0, "sin_monto": 0, "sin_tecnico": 0, "no_reconocidos": {}}
    cols_por_pestana: dict[str, dict] = {}

    for fila in filas:
        pestana = fila.get("_pestaña") or ""
        if pestana not in cols_por_pestana:
            cols_por_pestana[pestana] = _mapa_columnas(fila)
        cols = cols_por_pestana[pestana]
        if "tipo_venta" not in cols:
            continue
        if "SERVICIO" not in normalizar_texto(fila.get(cols["tipo_venta"])):
            continue

        m = PATRON_PESTANA_SEDE.match(pestana.strip())
        sede = normalizar_texto(m.group(1) if m else pestana)
        fecha = a_fecha(fila.get(cols.get("fecha", ""), ""))
        monto, registrado = _monto(fila, cols)
        tecnico = normalizar_tecnico(fila.get(cols.get("asesor", ""), ""))
        servicio, reconocido = clasificar_servicio(
            fila.get(cols.get("repuesto", ""), ""), fila.get(cols.get("nombre", ""), "")
        )

        if fecha is None:
            calidad["sin_fecha"] += 1
        if not registrado:
            calidad["sin_monto"] += 1
        if not tecnico:
            calidad["sin_tecnico"] += 1
            tecnico = "SIN TÉCNICO"
        if not reconocido:
            calidad["no_reconocidos"][servicio] = calidad["no_reconocidos"].get(servicio, 0) + 1

        servicios.append({
            "sede": sede,
            "tecnico": tecnico,
            "servicio": servicio,
            "fecha": fecha.isoformat() if fecha else "",
            "mes": f"{fecha.month:02d}-{MESES[fecha.month - 1]}" if fecha else "Sin fecha",
            "monto": round(monto, 2),
            "gratis": monto <= 0,
        })

    _unificar_tecnicos(servicios)
    calidad["no_reconocidos"] = sorted(calidad["no_reconocidos"].items(), key=lambda kv: -kv[1])
    return servicios, calidad


def pestanas_de_sede(fuente: dict) -> list[str]:
    todas = descubrir_pestanas(extraer_id_hoja(fuente["url"]))
    return [
        p for p in todas
        if PATRON_PESTANA_SEDE.match(p.strip())
        and normalizar_texto(PATRON_PESTANA_SEDE.match(p.strip()).group(1)) not in PESTANAS_EXCLUIDAS
    ]


def cargar_servicios(fuente: dict) -> tuple[list[dict], dict]:
    filas = cargar_datos({**fuente, "hojas": pestanas_de_sede(fuente)})
    return estandarizar(filas)


def _agrupar(servicios: list[dict], clave: str) -> list[dict]:
    grupos: dict[str, dict] = {}
    for s in servicios:
        g = grupos.setdefault(s[clave], {"nombre": s[clave], "total": 0, "gratis": 0,
                                         "con_costo": 0, "ingresos": 0.0})
        g["total"] += 1
        if s["gratis"]:
            g["gratis"] += 1
        else:
            g["con_costo"] += 1
            g["ingresos"] += s["monto"]
    for g in grupos.values():
        g["ingresos"] = round(g["ingresos"], 2)
        g["ticket"] = round(g["ingresos"] / g["con_costo"], 2) if g["con_costo"] else 0.0
        g["pct_gratis"] = round(100 * g["gratis"] / g["total"], 1) if g["total"] else 0.0
        g["tipo"] = "Gratis" if g["con_costo"] == 0 else "Con costo" if g["gratis"] == 0 else "Mixto"
    return sorted(grupos.values(), key=lambda g: (-g["ingresos"], -g["total"], g["nombre"]))


def resumen(servicios: list[dict]) -> dict:
    con_costo = [s for s in servicios if not s["gratis"]]
    ingresos = round(sum(s["monto"] for s in con_costo), 2)
    return {
        "total": len(servicios),
        "gratis": len(servicios) - len(con_costo),
        "con_costo": len(con_costo),
        "ingresos": ingresos,
        "ticket": round(ingresos / len(con_costo), 2) if con_costo else 0.0,
        "tecnicos": len({s["tecnico"] for s in servicios}),
        "por_servicio": _agrupar(servicios, "servicio"),
        "por_tecnico": _agrupar(servicios, "tecnico"),
        "por_sede": _agrupar(servicios, "sede"),
        "por_mes": sorted(_agrupar(servicios, "mes"), key=lambda g: g["nombre"]),
    }
