import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { decisionesAPI } from '../../lib/api';
import {
  PERIODOS, formatoDia, formatoPct, formatoSoles, formatoVariacion, hoyLima, rangoDePeriodo, toCsv,
} from '../../lib/decisiones';
import {
  Activity, AlertCircle, AlertTriangle, Download, Loader2, MapPin, Package, RefreshCw, ShieldCheck,
  ShoppingCart, Sparkles, Target, TrendingUp,
} from '../../lib/icons';
import AdminDecisionesChat from './AdminDecisionesChat';

// Dashboard «Toma de Decisiones» (Sprint 5, F1a). Solo lectura y solo
// agregados: el backend (/api/decisiones/*) exige decisiones:read, que
// tienen ADMIN y DESARROLLADOR_WEB. Ver greenline/docs/Sprint5/.

const PESTANAS = [
  { id: 'chat', label: 'Pregúntale a tus datos', icon: Sparkles },
  { id: 'demanda', label: 'Demanda', icon: ShoppingCart },
  { id: 'zonas', label: 'Zonas', icon: MapPin },
  { id: 'postventa', label: 'Postventa', icon: ShieldCheck },
  { id: 'inventario', label: 'Inventario', icon: Package },
  { id: 'campanas', label: 'Campañas', icon: Target },
  { id: 'tecnico', label: 'Técnico', icon: Activity },
];

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// ------------------------------------------------------------
// Piezas comunes
// ------------------------------------------------------------

function Variacion({ valor }) {
  const texto = formatoVariacion(valor);
  if (!texto) return <span className="text-xs text-gray-400" title="Base menor que 10: sin comparación">sin comparación</span>;
  const color = valor > 0 ? 'text-green-700' : valor < 0 ? 'text-red-600' : 'text-gray-500';
  return <span className={`text-xs font-semibold ${color}`}>{texto} vs periodo anterior</span>;
}

function Tarjeta({ titulo, valor, detalle, alerta = false }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${alerta ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${alerta ? 'text-red-700' : 'text-gray-900'}`}>{valor}</p>
      {detalle && <div className="mt-1">{detalle}</div>}
    </div>
  );
}

function Seccion({ titulo, fuente, accion, children }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{titulo}</h3>
          {fuente && <p className="text-[11px] text-gray-400">{fuente}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

// Descarga los mismos agregados de la tabla (sin datos personales).
function BotonCsv({ nombre, filtros, columnas, filas }) {
  if (!filas?.length) return null;
  const descargar = () => {
    const blob = new Blob([toCsv(columnas, filas)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombre}_${filtros.desde}_${filtros.hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      type="button"
      onClick={descargar}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
    >
      <Download className="h-3.5 w-3.5" /> CSV
    </button>
  );
}

// Lista con barra a partir de [{ [clave]: etiqueta, total }].
function Ranking({ filas, clave, vacio = 'Sin datos en este periodo.', color = 'bg-brand' }) {
  if (!filas?.length) return <Vacio>{vacio}</Vacio>;
  const maximo = Math.max(...filas.map((f) => f.total));
  return (
    <ul className="space-y-2">
      {filas.map((f) => (
        <li key={f[clave]}>
          <div className="mb-0.5 flex justify-between gap-2 text-sm">
            <span className="text-gray-800">{f[clave]}</span>
            <span className="font-semibold text-gray-900">{f.total}</span>
          </div>
          <Barra valor={f.total} maximo={maximo} color={color} />
        </li>
      ))}
    </ul>
  );
}

function MapaCalor({ matriz }) {
  const maximo = Math.max(1, ...matriz.flat());
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] text-gray-500" aria-label="Pedidos por día de la semana y hora">
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="w-5 font-normal">{h % 3 === 0 ? h : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matriz.map((fila, d) => (
            <tr key={DIAS_SEMANA[d]}>
              <th className="pr-2 text-right font-semibold">{DIAS_SEMANA[d]}</th>
              {fila.map((v, h) => (
                <td key={h} className="p-0.5">
                  <div
                    className="h-4 w-4 rounded-sm bg-brand"
                    style={{ opacity: v === 0 ? 0.06 : 0.2 + 0.8 * (v / maximo) }}
                    title={`${DIAS_SEMANA[d]} ${h}:00 - ${v} pedidos`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Barra({ valor, maximo, color = 'bg-brand' }) {
  const pct = maximo > 0 ? Math.max(2, Math.round((valor / maximo) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Vacio({ children }) {
  return <p className="py-8 text-center text-sm text-gray-500">{children}</p>;
}

function Estado({ cargando, error, onReintentar }) {
  if (cargando) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin text-brand" /> Calculando indicadores...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertCircle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-gray-700">{error}</p>
        <button
          type="button"
          onClick={onReintentar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }
  return null;
}

// Carga un endpoint con los filtros vigentes; se repite al cambiarlos.
function useConsulta(fn, filtros) {
  const { accessToken } = useAuth();
  const [intento, setIntento] = useState(0);
  // `cargando` se deriva: la respuesta guardada es de otra consulta.
  const clave = `${JSON.stringify(filtros)}#${intento}`;
  const [estado, setEstado] = useState({ clave: null, datos: null, error: '' });

  useEffect(() => {
    let vigente = true;
    fn(accessToken, filtros)
      .then((datos) => vigente && setEstado({ clave, datos, error: '' }))
      .catch((e) => vigente && setEstado({
        clave,
        datos: null,
        error: e?.status === 403
          ? 'Tu rol no tiene acceso a este dashboard.'
          : e?.error || e?.message || 'No se pudieron cargar los indicadores.',
      }));
    return () => { vigente = false; };
  }, [fn, accessToken, filtros, clave]);

  const cargando = estado.clave !== clave;
  return {
    datos: cargando ? null : estado.datos,
    error: cargando ? '' : estado.error,
    cargando,
    reintentar: () => setIntento((n) => n + 1),
  };
}

// ------------------------------------------------------------
// Resumen (tarjetas superiores)
// ------------------------------------------------------------

function Resumen({ filtros }) {
  const { datos: r, cargando, error, reintentar } = useConsulta(decisionesAPI.resumen, filtros);
  if (cargando || error) return <Estado cargando={cargando} error={error} onReintentar={reintentar} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta titulo="Pedidos" valor={r.pedidos} detalle={<Variacion valor={r.variacion.pedidos} />} />
        <Tarjeta titulo="Unidades pedidas" valor={r.unidades} detalle={<Variacion valor={r.variacion.unidades} />} />
        <Tarjeta
          titulo="Monto pedido"
          valor={formatoSoles(r.monto)}
          detalle={<span className="text-xs text-gray-500">Ticket promedio {r.ticketPromedio == null ? '-' : formatoSoles(r.ticketPromedio)}</span>}
        />
        <Tarjeta
          titulo="Ventas (entregados)"
          valor={r.ventas}
          detalle={<span className="text-xs text-gray-500">Conversión {formatoPct(r.conversion)} · {formatoSoles(r.montoVentas)}</span>}
        />
        <Tarjeta
          titulo="Reclamaciones vencidas"
          valor={r.reclamacionesVencidas}
          alerta={r.reclamacionesVencidas > 0}
          detalle={<span className="text-xs text-gray-500">{r.reclamacionesPorVencer} por vencer (10 a 15 días hábiles)</span>}
        />
        <Tarjeta titulo="Garantías registradas" valor={r.garantias} />
        <Tarjeta
          titulo="Pedidos en curso"
          valor={r.enCurso}
          detalle={<span className="text-xs text-gray-500">{r.cancelados} cancelados en el periodo</span>}
        />
        <Tarjeta
          titulo="Estancados (+14 días)"
          valor={r.estancados}
          alerta={r.estancados > 0}
          detalle={<span className="text-xs text-gray-500">Revisa su estado en Pedidos</span>}
        />
      </div>
      <p className="text-[11px] text-gray-400">
        Pedidos = todos los estados salvo cancelado (demanda). Ventas = entregados y pagados en tienda.
        Conversión = entregados / (entregados + cancelados).
      </p>
    </div>
  );
}

// ------------------------------------------------------------
// Pestañas
// ------------------------------------------------------------

function SerieDiaria({ serie }) {
  const maximo = Math.max(1, ...serie.map((d) => d.pedidos));
  const ancho = 100 / serie.length;
  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="Pedidos por día">
        {serie.map((d, i) => {
          const alto = (d.pedidos / maximo) * 38;
          return (
            <rect key={d.dia} x={i * ancho + ancho * 0.15} y={40 - alto} width={ancho * 0.7} height={alto} className="fill-brand">
              <title>{`${formatoDia(d.dia)}: ${d.pedidos} pedidos, ${d.ventas} ventas, ${formatoSoles(d.monto)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-gray-400">
        <span>{formatoDia(serie[0].dia)}</span>
        <span>máx. {maximo} pedidos/día</span>
        <span>{formatoDia(serie[serie.length - 1].dia)}</span>
      </div>
    </div>
  );
}

function Demanda({ filtros }) {
  const { datos, cargando, error, reintentar } = useConsulta(decisionesAPI.demanda, filtros);
  if (cargando || error) return <Estado cargando={cargando} error={error} onReintentar={reintentar} />;
  const maximo = Math.max(0, ...datos.modelos.map((m) => m.unidades));

  return (
    <div className="space-y-4">
      <Seccion titulo="Pedidos por día" fuente="Pedidos web, sin cancelados · pasa el cursor por una barra">
        {datos.serie.some((d) => d.pedidos > 0) ? <SerieDiaria serie={datos.serie} /> : <Vacio>Sin pedidos en este periodo.</Vacio>}
      </Seccion>

      {datos.agotadosConPedidos.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Modelos marcados <strong>Fuera de stock</strong> que igual recibieron pedidos:{' '}
            {datos.agotadosConPedidos.map((m) => `${m.nombre} (${m.unidades} u.)`).join(', ')}.
          </p>
        </div>
      )}

      <Seccion
        titulo="Modelos más pedidos"
        fuente="Unidades y monto de pedidos sin cancelados; vendidas = entregadas"
        accion={(
          <BotonCsv
            nombre="modelos"
            filtros={filtros}
            filas={datos.modelos.map((m) => ({
              ...m,
              colores: m.colores.map((c) => `${c.color} ${c.unidades}`).join(' / '),
              variacion: formatoVariacion(m.variacion) || '',
            }))}
            columnas={[
              { clave: 'nombre', titulo: 'Modelo' },
              { clave: 'unidades', titulo: 'Unidades' },
              { clave: 'variacion', titulo: 'Variación' },
              { clave: 'unidadesVendidas', titulo: 'Vendidas' },
              { clave: 'monto', titulo: 'Monto (S/)' },
              { clave: 'pedidos', titulo: 'Pedidos' },
              { clave: 'colores', titulo: 'Colores' },
            ]}
          />
        )}
      >
        {datos.modelos.length === 0 ? <Vacio>Sin pedidos en este periodo.</Vacio> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Modelo</th>
                  <th className="py-2 pr-3 w-1/4">Unidades</th>
                  <th className="py-2 pr-3">Vendidas</th>
                  <th className="py-2 pr-3">Monto</th>
                  <th className="py-2">Colores</th>
                </tr>
              </thead>
              <tbody>
                {datos.modelos.map((m) => (
                  <tr key={m.slug || m.nombre} className="border-b border-gray-50 align-top">
                    <td className="py-2 pr-3 font-semibold text-gray-900">
                      {m.nombre}
                      {m.agotado && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Agotado</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="w-8 shrink-0 font-semibold">{m.unidades}</span>
                        <Barra valor={m.unidades} maximo={maximo} />
                      </div>
                      <Variacion valor={m.variacion} />
                    </td>
                    <td className="py-2 pr-3">{m.unidadesVendidas}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatoSoles(m.monto)}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {m.colores.map((c) => (
                          <span key={c.color} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                            {c.color} · {Math.round((c.unidades / m.unidades) * 100)} %
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion titulo="¿Cuándo piden?" fuente="Pedidos por día de la semana y hora de Lima">
        {datos.serie.some((d) => d.pedidos > 0) ? <MapaCalor matriz={datos.horario} /> : <Vacio>Sin pedidos en este periodo.</Vacio>}
      </Seccion>

      <Seccion
        titulo="Demanda no atendida por la sede"
        fuente="Unidades que se pidieron al almacén central porque la tienda no tenía stock (solo flujo /shop-prototipo)"
      >
        {!datos.noAtendida.activado ? <Vacio>Las solicitudes al almacén no están disponibles en esta base.</Vacio> : (
          <>
            <p className="mb-3 text-sm text-gray-600">
              {datos.noAtendida.pedidosConSolicitud} pedidos necesitaron stock del almacén
              ({formatoPct(datos.noAtendida.porcentajePedidos)} de los pedidos del periodo).
            </p>
            {datos.noAtendida.modelos.length === 0 ? <Vacio>Ninguna solicitud al almacén en este periodo.</Vacio> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-3">Modelo</th>
                    <th className="py-2 pr-3">Solicitadas</th>
                    <th className="py-2 pr-3">Aún sin atender</th>
                    <th className="py-2">Solicitudes</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.noAtendida.modelos.map((m) => (
                    <tr key={m.slug || m.nombre} className="border-b border-gray-50">
                      <td className="py-2 pr-3 font-semibold text-gray-900">{m.nombre}</td>
                      <td className="py-2 pr-3">{m.solicitadas}</td>
                      <td className={`py-2 pr-3 ${m.faltantes > 0 ? 'font-semibold text-red-600' : ''}`}>{m.faltantes}</td>
                      <td className="py-2">{m.solicitudes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Seccion>
    </div>
  );
}

function Zonas({ filtros }) {
  const { datos, cargando, error, reintentar } = useConsulta(decisionesAPI.zonas, filtros);
  if (cargando || error) return <Estado cargando={cargando} error={error} onReintentar={reintentar} />;
  const maximo = Math.max(0, ...datos.zonas.map((z) => z.pedidos));
  const maxTienda = Math.max(0, ...datos.tiendas.map((t) => t.pedidos));
  const sinPunto = datos.zonas.filter((z) => !z.conPuntoDeVenta && z.departamento !== 'Sin dato');

  return (
    <div className="space-y-4">
      {sinPunto.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>{sinPunto.reduce((s, z) => s + z.pedidos, 0)} pedidos</strong> vienen de provincias sin tienda ni distribuidor activo:{' '}
            {[...new Set(sinPunto.map((z) => `${z.provincia} (${z.departamento})`))].join(', ')}.
          </p>
        </div>
      )}

      <Seccion
        titulo="Pedidos por zona del cliente"
        fuente="Distritos con menos de 3 pedidos se agrupan en 'Otros'"
        accion={(
          <BotonCsv
            nombre="zonas"
            filtros={filtros}
            filas={datos.zonas.map((z) => ({ ...z, conPuntoDeVenta: z.conPuntoDeVenta ? 'Sí' : 'No' }))}
            columnas={[
              { clave: 'departamento', titulo: 'Departamento' },
              { clave: 'provincia', titulo: 'Provincia' },
              { clave: 'distrito', titulo: 'Distrito' },
              { clave: 'pedidos', titulo: 'Pedidos' },
              { clave: 'unidades', titulo: 'Unidades' },
              { clave: 'conPuntoDeVenta', titulo: 'Punto de venta' },
            ]}
          />
        )}
      >
        {datos.zonas.length === 0 ? <Vacio>Sin pedidos en este periodo.</Vacio> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Departamento / Provincia</th>
                  <th className="py-2 pr-3">Distrito</th>
                  <th className="py-2 pr-3 w-1/3">Pedidos</th>
                  <th className="py-2">Punto de venta</th>
                </tr>
              </thead>
              <tbody>
                {datos.zonas.map((z) => (
                  <tr key={`${z.departamento}|${z.provincia}|${z.distrito}`} className="border-b border-gray-50">
                    <td className="py-2 pr-3">{z.departamento} / {z.provincia}</td>
                    <td className="py-2 pr-3">{z.distrito}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="w-8 shrink-0 font-semibold">{z.pedidos}</span>
                        <Barra valor={z.pedidos} maximo={maximo} />
                      </div>
                    </td>
                    <td className="py-2">
                      {z.conPuntoDeVenta
                        ? <span className="text-xs text-green-700">Sí</span>
                        : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Pedidos por tienda de retiro" fuente="Pedidos sin cancelados, ventas y monto">
        {datos.tiendas.length === 0 ? <Vacio>Sin pedidos en este periodo.</Vacio> : (
          <ul className="space-y-3">
            {datos.tiendas.map((t) => (
              <li key={t.tiendaId || 'sin-tienda'}>
                <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-semibold text-gray-900">{t.nombre}</span>
                  <span className="text-gray-500">{t.pedidos} pedidos · {t.ventas} ventas · {formatoSoles(t.monto)}</span>
                </div>
                <Barra valor={t.pedidos} maximo={maxTienda} />
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </div>
  );
}

const COLOR_SEMAFORO = {
  verde: 'bg-green-100 text-green-800',
  ambar: 'bg-amber-100 text-amber-800',
  rojo: 'bg-red-100 text-red-800',
};

function Postventa({ filtros }) {
  const { datos, cargando, error, reintentar } = useConsulta(decisionesAPI.postventa, filtros);
  if (cargando || error) return <Estado cargando={cargando} error={error} onReintentar={reintentar} />;
  const { semaforo, enRiesgo } = datos.reclamaciones;
  const maximo = Math.max(0, ...datos.garantias.map((g) => g.total));

  return (
    <div className="space-y-4">
      <Seccion titulo="Libro de Reclamaciones: plazo legal de 15 días hábiles" fuente="Abiertas hoy (pendiente o en proceso), de todas las sedes">
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[['verde', 'Al día (< 10)'], ['ambar', 'Por vencer (10 a 15)'], ['rojo', 'Vencidas (> 15)']].map(([k, label]) => (
            <div key={k} className={`rounded-lg p-3 text-center ${COLOR_SEMAFORO[k]}`}>
              <p className="text-2xl font-bold">{semaforo[k]}</p>
              <p className="text-xs font-semibold">{label}</p>
            </div>
          ))}
        </div>
        {enRiesgo.length === 0 ? <Vacio>No hay reclamaciones por vencer ni vencidas.</Vacio> : (
          <ul className="divide-y divide-gray-50 text-sm">
            {enRiesgo.map((r) => (
              <li key={r.correlativo} className="flex items-center justify-between py-2">
                <span className="font-mono text-gray-800">{r.correlativo}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_SEMAFORO[r.semaforo]}`}>
                  {r.diasHabiles} días hábiles
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Reclamaciones del periodo" fuente={`${datos.reclamaciones.periodo.total} registradas; el Libro no guarda la tienda, así que no se filtra por sede`}>
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Por tipo</p>
            <Ranking filas={datos.reclamaciones.periodo.porTipo} clave="tipo" color="bg-red-400" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Por modelo</p>
            <Ranking filas={datos.reclamaciones.periodo.porModelo} clave="modelo" color="bg-red-400" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Por área</p>
            <Ranking filas={datos.reclamaciones.periodo.porArea} clave="area" color="bg-red-400" />
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-600">
          Tiempo de respuesta (mediana):{' '}
          {datos.reclamaciones.respuesta.n === 0
            ? 'sin datos (nadie registró la fecha de respuesta en el periodo).'
            : `${datos.reclamaciones.respuesta.medianaDiasHabiles} días hábiles, sobre ${datos.reclamaciones.respuesta.n} respondidas.`}
        </p>
      </Seccion>

      <Seccion
        titulo="Citas de servicio técnico"
        fuente={`${datos.citas.total} citas con fecha en el periodo · rechazadas ${formatoPct(datos.citas.tasaRechazo)}`}
      >
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Por servicio</p>
            <Ranking filas={datos.citas.porServicio} clave="servicio" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Por sede</p>
            <Ranking filas={datos.citas.porTienda} clave="tienda" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Por estado</p>
            <Ranking filas={datos.citas.porEstado} clave="estado" />
          </div>
        </div>
      </Seccion>

      <Seccion
        titulo="Garantías por modelo"
        fuente="Registradas en el periodo; causas más frecuentes y costo"
        accion={(
          <BotonCsv
            nombre="garantias"
            filtros={filtros}
            filas={datos.garantias.map((g) => ({ ...g, causas: g.causas.map((c) => `${c.causa} ${c.total}`).join(' / ') }))}
            columnas={[
              { clave: 'modelo', titulo: 'Modelo' },
              { clave: 'total', titulo: 'Garantías' },
              { clave: 'costo', titulo: 'Costo (S/)' },
              { clave: 'causas', titulo: 'Causas principales' },
            ]}
          />
        )}
      >
        {datos.garantias.length === 0 ? <Vacio>Sin garantías en este periodo.</Vacio> : (
          <ul className="space-y-4">
            {datos.garantias.map((g) => (
              <li key={g.modelo}>
                <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-semibold text-gray-900">{g.modelo}</span>
                  <span className="text-gray-500">{g.total} garantías · costo {formatoSoles(g.costo)}</span>
                </div>
                <Barra valor={g.total} maximo={maximo} color="bg-amber-500" />
                <p className="mt-1 text-xs text-gray-500">
                  {g.causas.map((c) => `${c.causa} (${c.total})`).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </div>
  );
}

function Inventario({ filtros }) {
  const { datos, cargando, error, reintentar } = useConsulta(decisionesAPI.inventario, filtros);
  if (cargando || error) return <Estado cargando={cargando} error={error} onReintentar={reintentar} />;
  if (!datos.stockActivado) return <Vacio>Las tablas de stock no están disponibles en esta base.</Vacio>;
  const maximo = Math.max(0, ...datos.porModelo.map((m) => m.total));

  return (
    <div className="space-y-4">
      <Seccion
        titulo={`Cobertura menor a ${datos.cobertura.umbralDias} días`}
        fuente="Último cálculo del pronóstico de demanda por tienda"
      >
        {!datos.cobertura.activado ? (
          <Vacio>El pronóstico de stock todavía no está activado (migración del Sprint 4 sin aplicar).</Vacio>
        ) : datos.cobertura.filas.length === 0 ? (
          <Vacio>Ningún producto por debajo del umbral.</Vacio>
        ) : (
          <ul className="divide-y divide-gray-50 text-sm">
            {datos.cobertura.filas.map((c) => (
              <li key={`${c.producto}|${c.tienda}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><strong>{c.producto}</strong> · {c.tienda}</span>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                  {c.diasCobertura} días · stock {c.stockActual}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion
        titulo={`Stock inmovilizado (sin pedidos en ${datos.diasInmovilizado} días)`}
        fuente="Candidatos a promoción o traslado entre sedes"
      >
        {datos.inmovilizado.length === 0 ? <Vacio>Todo el stock tuvo pedidos recientes.</Vacio> : (
          <ul className="divide-y divide-gray-50 text-sm">
            {datos.inmovilizado.map((m) => (
              <li key={m.slug} className="flex justify-between gap-2 py-2">
                <span className="font-semibold text-gray-900">{m.nombre}</span>
                <span className="text-gray-600">{m.total} u. ({m.tiendas} en tiendas, {m.almacen} en almacén)</span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion
        titulo="Stock por modelo"
        fuente={filtros.tiendaId ? 'Tiendas = la sede elegida; almacén = central' : 'Tiendas = todas las sedes; almacén = central'}
        accion={(
          <BotonCsv
            nombre="stock"
            filtros={filtros}
            filas={datos.porModelo.map((m) => ({ ...m, disponible: m.disponible ? 'Sí' : 'No' }))}
            columnas={[
              { clave: 'nombre', titulo: 'Modelo' },
              { clave: 'tiendas', titulo: 'Tiendas' },
              { clave: 'almacen', titulo: 'Almacén' },
              { clave: 'total', titulo: 'Total' },
              { clave: 'unidades60', titulo: `Pedidas (${datos.diasInmovilizado} días)` },
              { clave: 'disponible', titulo: 'Disponible en web' },
            ]}
          />
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">Modelo</th>
                <th className="py-2 pr-3 w-1/3">Total</th>
                <th className="py-2 pr-3">Tiendas</th>
                <th className="py-2 pr-3">Almacén</th>
                <th className="py-2">Pedidas ({datos.diasInmovilizado} días)</th>
              </tr>
            </thead>
            <tbody>
              {datos.porModelo.map((m) => (
                <tr key={m.slug} className="border-b border-gray-50">
                  <td className="py-2 pr-3 font-semibold text-gray-900">
                    {m.nombre}
                    {!m.disponible && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">No disponible</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="w-8 shrink-0 font-semibold">{m.total}</span>
                      <Barra valor={m.total} maximo={maximo} />
                    </div>
                  </td>
                  <td className="py-2 pr-3">{m.tiendas}</td>
                  <td className="py-2 pr-3">{m.almacen}</td>
                  <td className="py-2">{m.unidades60}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  );
}

function Campanas({ filtros }) {
  const { datos, cargando, error, reintentar } = useConsulta(decisionesAPI.campanas, filtros);
  if (cargando || error) return <Estado cargando={cargando} error={error} onReintentar={reintentar} />;
  if (datos.campanas.length === 0) return <Vacio>Todavía no empezó ninguna campaña con fechas fijas.</Vacio>;

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-400">
        Las campañas usan sus propias fechas (no el periodo elegido). Base = los 14 días previos a cada campaña.
        Halloween y Cyber Wow no tienen fechas fijas y no se miden aquí.
      </p>
      {datos.campanas.map((c) => (
        <Seccion
          key={c.id}
          titulo={`${c.nombre}${c.enCurso ? ' (en curso)' : ''}`}
          fuente={`${c.desde} a ${c.hasta} · ${c.pedidos} pedidos`}
        >
          <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="text-2xl font-bold text-gray-900">{c.pedidosDia} <span className="text-sm font-normal text-gray-500">pedidos/día</span></p>
            <p className="text-sm text-gray-500">base {c.baseDia}/día</p>
            <Variacion valor={c.variacion} />
          </div>
          {c.modelosTop.length === 0 ? <Vacio>Sin pedidos durante la campaña.</Vacio> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Modelo</th>
                  <th className="py-2 pr-3">Unidades/día</th>
                  <th className="py-2">Base/día</th>
                </tr>
              </thead>
              <tbody>
                {c.modelosTop.map((m) => (
                  <tr key={m.slug || m.nombre} className="border-b border-gray-50">
                    <td className="py-2 pr-3 font-semibold text-gray-900">{m.nombre}</td>
                    <td className="py-2 pr-3">{m.unidadesDia}</td>
                    <td className="py-2">{m.baseDia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Seccion>
      ))}
    </div>
  );
}

function Tecnico({ filtros }) {
  const { datos, cargando, error, reintentar } = useConsulta(decisionesAPI.tecnico, filtros);
  if (cargando || error) return <Estado cargando={cargando} error={error} onReintentar={reintentar} />;
  const { correos, asistente, contactos, clientes } = datos;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta
          titulo="Correos con error"
          valor={formatoPct(correos.tasaError)}
          alerta={correos.errores > 0}
          detalle={<span className="text-xs text-gray-500">{correos.errores} de {correos.total} en el periodo</span>}
        />
        <Tarjeta
          titulo="Pedidos sin correo"
          valor={correos.pedidosSinCorreo}
          alerta={correos.pedidosSinCorreo > 0}
          detalle={<span className="text-xs text-gray-500">Reenviar desde Pedidos</span>}
        />
        <Tarjeta
          titulo="Asistente este mes"
          valor={asistente.activado ? `US$ ${asistente.costoMesUsd}` : '-'}
          alerta={asistente.usoTope >= 0.8}
          detalle={(
            <span className="text-xs text-gray-500">
              {asistente.activado
                ? `${asistente.consultasMes} consultas · ${formatoPct(asistente.usoTope)} del tope de US$ ${asistente.topeMesUsd}`
                : 'Tabla de consumo sin migrar'}
            </span>
          )}
        />
        <Tarjeta
          titulo="Clientes registrados"
          valor={clientes.total}
          detalle={<span className="text-xs text-gray-500">{clientes.altas} altas en el periodo · {clientes.sinCorreos} sin correos de marketing</span>}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Seccion
          titulo="Contactos"
          fuente={`${contactos.total} en el periodo · ${contactos.sinLeer} sin leer · solo asuntos repetidos 3 o más veces`}
        >
          <Ranking filas={contactos.asuntosFrecuentes} clave="asunto" vacio="Ningún asunto se repite 3 o más veces." />
        </Seccion>
        <Seccion titulo="Altas de clientes" fuente="Por región y origen, en el periodo">
          <div className="grid gap-4 sm:grid-cols-2">
            <Ranking filas={clientes.porRegion} clave="region" />
            <Ranking filas={clientes.porOrigen} clave="origen" />
          </div>
        </Seccion>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Página
// ------------------------------------------------------------

export default function AdminDecisiones() {
  const [periodo, setPeriodo] = useState('30d');
  const [rango, setRango] = useState(() => rangoDePeriodo('30d'));
  const [tiendaId, setTiendaId] = useState('');
  const [tiendas, setTiendas] = useState([]);
  const [pestana, setPestana] = useState('chat');

  useEffect(() => {
    supabase
      .from('greenline_stores')
      .select('id, name')
      .eq('active', true)
      .order('name')
      .then(({ data }) => setTiendas(data || []));
  }, []);

  const elegirPeriodo = useCallback((id) => {
    setPeriodo(id);
    if (id !== 'rango') setRango(rangoDePeriodo(id));
  }, []);

  // Objeto estable: las consultas solo se repiten cuando cambia un filtro.
  const filtros = useMemo(
    () => ({ desde: rango.desde, hasta: rango.hasta, tiendaId: tiendaId || undefined }),
    [rango.desde, rango.hasta, tiendaId],
  );

  const Pestana = {
    demanda: Demanda, zonas: Zonas, postventa: Postventa, inventario: Inventario, campanas: Campanas, tecnico: Tecnico,
  }[pestana];
  const hoy = hoyLima();

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <TrendingUp className="h-5 w-5 text-brand" /> Toma de Decisiones
          </h2>
          <p className="text-sm text-gray-500">
            {rango.desde} a {rango.hasta}, comparado con el periodo anterior de igual duración.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-gray-600">
            Periodo
            <select
              value={periodo}
              onChange={(e) => elegirPeriodo(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {periodo === 'rango' && (
            <>
              <label className="text-xs font-semibold text-gray-600">
                Desde
                <input
                  type="date"
                  value={rango.desde}
                  max={rango.hasta}
                  onChange={(e) => e.target.value && setRango((r) => ({ ...r, desde: e.target.value }))}
                  className="mt-1 block rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Hasta
                <input
                  type="date"
                  value={rango.hasta}
                  min={rango.desde}
                  max={hoy}
                  onChange={(e) => e.target.value && setRango((r) => ({ ...r, hasta: e.target.value }))}
                  className="mt-1 block rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
            </>
          )}
          <label className="text-xs font-semibold text-gray-600">
            Tienda
            <select
              value={tiendaId}
              onChange={(e) => setTiendaId(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {tiendas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      <Resumen filtros={filtros} />

      <div role="tablist" aria-label="Secciones del dashboard" className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {PESTANAS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              pestana === id ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {pestana === 'chat'
          ? <AdminDecisionesChat filtros={filtros} onIrA={setPestana} />
          : <Pestana filtros={filtros} />}
      </div>
    </div>
  );
}
