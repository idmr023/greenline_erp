import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../lib/utils';
import { Package, ChevronDown, Phone, Mail, RefreshCw, Truck, Warehouse } from '../../lib/icons';
import { CONTACT } from '../../lib/config';
import { pedidosAPI, stockAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

// ============================================================
// Pedidos por tienda
// ------------------------------------------------------------
// Cada pedido tiene una tienda de retiro. Al registrarlo, el backend
// reserva lo que hay en esa tienda; lo que no alcanza se pide al
// almacén central y el pedido queda SOLICITADO_ALMACEN.
//
// Aquí se ven los pedidos y, en la otra pestaña, las solicitudes al
// almacén: el almacén sirve lo que puede (las unidades salen del
// almacén y entran a la tienda).
//
// Los estados son los de la base (pedidos_estado_check):
//   NUEVO → SOLICITADO_ALMACEN → EN_PREPARACION → EN_TRASLADO →
//   LISTO → ENTREGADO, con CANCELADO como salida.
// ============================================================

const ESTADOS = [
  { value: 'NUEVO', label: 'Nuevo', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700' },
  { value: 'SOLICITADO_ALMACEN', label: 'Solicitado al almacén', dot: 'bg-cyan-500', badge: 'bg-cyan-50 text-cyan-700' },
  { value: 'EN_PREPARACION', label: 'En preparación', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700' },
  { value: 'EN_TRASLADO', label: 'En traslado', dot: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700' },
  { value: 'LISTO', label: 'Listo para retirar', dot: 'bg-teal-500', badge: 'bg-teal-50 text-teal-700' },
  { value: 'ENTREGADO', label: 'Entregado', dot: 'bg-green-500', badge: 'bg-green-50 text-green-700' },
  { value: 'CANCELADO', label: 'Cancelado', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700' },
];

const est = (v) => ESTADOS.find((e) => e.value === v) || ESTADOS[0];

const ESTADOS_SOLICITUD = [
  { value: '', label: 'Todas' },
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'PARCIAL', label: 'Parciales' },
  { value: 'ATENDIDA', label: 'Atendidas' },
  { value: 'CANCELADA', label: 'Canceladas' },
];

function formatFecha(iso) {
  try {
    return new Date(iso).toLocaleString('es-PE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AdminPedidos() {
  const { accessToken } = useAuth();
  const [pestana, setPestana] = useState('pedidos');
  const [pedidos, setPedidos] = useState([]);
  const [tiendas, setTiendas] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [filtroSolicitud, setFiltroSolicitud] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [atendiendo, setAtendiendo] = useState(null);
  const [servir, setServir] = useState({});

  const nombreTienda = useMemo(() => {
    const mapa = new Map(tiendas.map((t) => [t.id, t.name]));
    return (id) => mapa.get(id) || (id ? 'Tienda' : 'Sin tienda');
  }, [tiendas]);

  useEffect(() => {
    load();
    supabase
      .from('greenline_stores')
      .select('id, name, active')
      .order('name')
      .then(({ data }) => setTiendas(data || []));
  }, []);

  async function load() {
    const { data, error: err } = await supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) {
      setError('No se pudieron cargar los pedidos.');
    }
    setPedidos(data || []);
    setLoading(false);
    await loadSolicitudes();
  }

  async function loadSolicitudes() {
    if (!accessToken) {
      setSolicitudes([]);
      return;
    }
    try {
      const res = await stockAPI.solicitudesAlmacen(accessToken, {
        estado: filtroSolicitud || undefined,
      });
      setSolicitudes(res?.solicitudes || []);
    } catch (err) {
      setSolicitudes([]);
      setError(err?.error || 'No se pudieron cargar las solicitudes al almacén.');
    }
  }

  async function changeEstado(pedido, next) {
    if (!next) return;
    setSavingId(pedido.id);
    try {
      // Cancelar libera el stock que el pedido tenía reservado en la
      // tienda: lo hace el backend (no el panel) para que quede auditado.
      if (next === 'CANCELADO') {
        await stockAPI.cancelarPedido(accessToken, pedido.id);
      } else {
        const { error: err } = await supabase
          .from('pedidos')
          .update({ estado: next })
          .eq('id', pedido.id);
        if (err) throw new Error(err.message);
      }
      setPedidos((prev) =>
        prev.map((p) => (p.id === pedido.id ? { ...p, estado: next } : p)),
      );
    } catch (err) {
      alert(err?.error || err?.message || 'No se pudo actualizar el estado.');
    } finally {
      setSavingId(null);
    }
  }

  const waLink = (p) =>
    `${CONTACT.whatsappUrl}?text=${encodeURIComponent(
      `Hola ${p.cliente?.nombre || ''}, sobre tu pedido ${p.codigo} en GreenLine...`,
    )}`;

  async function reenviarCorreo(p) {
    if (!accessToken) {
      alert('Sesión no disponible. Vuelve a iniciar sesión.');
      return;
    }
    setSendingId(p.id);
    try {
      const res = await pedidosAPI.reenviarEmail({ codigo: p.codigo }, accessToken);
      if (res?.ok) {
        // El envío ocurre en la cola del backend; refrescamos ahora y un poco
        // después para capturar email_enviado/email_error cuando el worker termine.
        load();
        setTimeout(load, 2500);
      } else {
        alert(res?.error || 'No se pudo encolar el correo.');
      }
    } catch (err) {
      alert(err?.error || 'No se pudo enviar el correo.');
    } finally {
      setSendingId(null);
    }
  }

  async function atender(solicitud) {
    const items = (solicitud.items || [])
      .map((item) => {
        const pedido = Number(servir[`${solicitud.id}:${item.id}`] ?? 0);
        if (!pedido || pedido <= 0) return null;
        return { itemId: item.id, cantidadAtendida: pedido };
      })
      .filter(Boolean);

    if (!items.length) {
      alert('Indica cuántas unidades salen del almacén.');
      return;
    }

    setAtendiendo(solicitud.id);
    try {
      await stockAPI.atenderSolicitud(accessToken, solicitud.id, items);
      setServir({});
      await loadSolicitudes();
      await load();
    } catch (err) {
      alert(err?.error || err?.message || 'No se pudo atender la solicitud.');
    } finally {
      setAtendiendo(null);
    }
  }

  const pendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE' || s.estado === 'PARCIAL');

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pedidos realizados desde la tienda web. Cada pedido tiene una tienda de retiro:
            si la sede no tiene stock, se pide al almacén central.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Recargar
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setPestana('pedidos')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
            pestana === 'pedidos' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Pedidos
        </button>
        <button
          type="button"
          onClick={() => setPestana('solicitudes')}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold ${
            pestana === 'solicitudes' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <Warehouse className="w-4 h-4" />
          Solicitudes al almacén
          {pendientes.length > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700">
              {pendientes.length}
            </span>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {pestana === 'solicitudes' ? (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {ESTADOS_SOLICITUD.map((f) => (
              <button
                key={f.value || 'todas'}
                type="button"
                onClick={() => {
                  setFiltroSolicitud(f.value);
                  setTimeout(loadSolicitudes, 0);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                  filtroSolicitud === f.value
                    ? 'bg-brand text-white'
                    : 'text-gray-500 border border-gray-200 hover:border-brand hover:text-brand'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {solicitudes.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
              <Warehouse className="w-8 h-8 mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No hay solicitudes al almacén.</p>
            </div>
          ) : (
            solicitudes.map((solicitud) => {
              const estado = solicitud.estado === 'ATENDIDA'
                ? { label: 'Atendida', badge: 'bg-green-50 text-green-700' }
                : solicitud.estado === 'PARCIAL'
                  ? { label: 'Parcial', badge: 'bg-amber-50 text-amber-700' }
                  : solicitud.estado === 'CANCELADA'
                    ? { label: 'Cancelada', badge: 'bg-gray-100 text-gray-600' }
                    : { label: 'Pendiente', badge: 'bg-cyan-50 text-cyan-700' };
              const servible = solicitud.estado === 'PENDIENTE' || solicitud.estado === 'PARCIAL';
              return (
                <div key={solicitud.id} className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {solicitud.codigo}
                        {solicitud.pedido_codigo && (
                          <span className="ml-2 text-xs font-medium text-gray-400">
                            pedido {solicitud.pedido_codigo}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {nombreTienda(solicitud.tienda_id)} · {formatFecha(solicitud.created_at)}
                      </p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${estado.badge}`}>
                      {estado.label}
                    </span>
                  </div>

                  <div className="divide-y divide-gray-50">
                    {(solicitud.items || []).map((item) => {
                      const pendiente = Math.max(
                        Number(item.cantidad || 0) - Number(item.cantidad_atendida || 0),
                        0,
                      );
                      const clave = `${solicitud.id}:${item.id}`;
                      const maximo = Math.min(pendiente, Number(item.stock_almacen || 0));
                      return (
                        <div key={item.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                          <div className="text-sm text-gray-700">
                            {item.producto}
                            {item.color ? <span className="text-gray-400"> ({item.color})</span> : null}
                            <span className="text-gray-400">
                              {' '}
                              · pedido {item.cantidad} · servido {item.cantidad_atendida || 0}
                              {pendiente > 0 ? ` · falta ${pendiente}` : ''}
                            </span>
                            <span className="block text-xs text-gray-400">
                              Almacén: {item.stock_almacen || 0} unidad(es)
                            </span>
                          </div>
                          {servible && pendiente > 0 && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max={maximo}
                                defaultValue={maximo}
                                onChange={(e) =>
                                  setServir((prev) => ({ ...prev, [clave]: e.target.value }))
                                }
                                className="input w-24 text-sm"
                                aria-label={`Unidades a servir de ${item.producto}`}
                              />
                              <span className="text-xs text-gray-400">de {maximo}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {servible && (
                    <button
                      type="button"
                      disabled={atendiendo === solicitud.id}
                      onClick={() => atender(solicitud)}
                      className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand/10 text-brand text-sm font-semibold hover:bg-brand/20 transition-colors disabled:opacity-50"
                    >
                      <Truck className="w-4 h-4" />
                      {atendiendo === solicitud.id ? 'Enviando al almacén...' : 'Servir desde el almacén'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : pedidos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <Package className="w-8 h-8 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">Aún no hay pedidos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => {
            const st = est(p.estado);
            const isExpanded = expanded === p.id;
            const items = Array.isArray(p.items) ? p.items : [];
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-100">
                {/* Resumen */}
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : p.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">
                        {p.codigo}
                        <span className="ml-2 text-xs font-medium text-gray-400">
                          {formatFecha(p.created_at)}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {p.cliente?.nombre}
                        {p.cliente?.telefono ? ` · ${p.cliente.telefono}` : ''}
                        {p.tienda_id ? ` · ${nombreTienda(p.tienda_id)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.badge}`}>
                      {st.label}
                    </span>
                    {p.email_enviado === true && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700">
                        Correo ✓
                      </span>
                    )}
                    {p.email_enviado !== true && (
                      <span
                        title={p.email_error || 'Correo de notificación no confirmado'}
                        className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700"
                      >
                        Sin correo
                      </span>
                    )}
                    <span className="text-sm font-bold text-gray-900">
                      {formatPrice(p.total)}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* Detalle */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                    {/* Tienda de retiro */}
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Package className="w-4 h-4 text-gray-400" />
                      Tienda de retiro:{' '}
                      <span className="font-semibold text-gray-900">
                        {nombreTienda(p.tienda_id)}
                      </span>
                      {p.estado === 'SOLICITADO_ALMACEN' && (
                        <span className="text-xs font-semibold text-cyan-700">
                          — hay unidades que pide al almacén central
                        </span>
                      )}
                    </div>

                    {/* Ítems */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Productos
                      </p>
                      <div className="divide-y divide-gray-50">
                        {items.map((it, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                            <span className="text-gray-700">
                              {it.nombre}
                              {it.color ? <span className="text-gray-400"> ({it.color})</span> : null}
                              <span className="text-gray-400"> × {it.cantidad}</span>
                            </span>
                            <span className="font-medium text-gray-900">
                              {formatPrice(it.precio_actual * it.cantidad)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between py-1.5 text-sm">
                          <span className="font-semibold text-gray-900">Total</span>
                          <span className="font-bold text-brand">{formatPrice(p.total)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Cliente */}
                    <div className="flex flex-wrap gap-3">
                      <a
                        href={waLink(p)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#25D366]/10 text-[#128C7E] text-sm font-semibold hover:bg-[#25D366]/20 transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                        {p.cliente?.telefono || 'WhatsApp'}
                      </a>
                      {p.cliente?.email && (
                        <a
                          href={`mailto:${p.cliente.email}`}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors"
                        >
                          <Mail className="w-4 h-4" />
                          {p.cliente.email}
                        </a>
                      )}
                    </div>

                    {/* Correo de notificación */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Correo de notificación
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {p.email_enviado === true
                            ? `Enviado${p.email_enviado_at ? ` ${formatFecha(p.email_enviado_at)}` : ''}`
                            : p.email_error
                              ? `Error: ${p.email_error}`
                              : 'Aún no enviado'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={sendingId === p.id}
                        onClick={() => reenviarCorreo(p)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand/10 text-brand text-sm font-semibold hover:bg-brand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Mail className="w-4 h-4" />
                        {sendingId === p.id ? 'Enviando...' : 'Enviar correo'}
                      </button>
                    </div>

                    {/* Cambio de estado */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Estado:
                      </span>
                      {[st, ...ESTADOS.filter((e) => e.value !== p.estado)].map((op) => (
                        <button
                          key={op.value}
                          type="button"
                          disabled={savingId === p.id}
                          onClick={() => changeEstado(p, op.value)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                            p.estado === op.value
                              ? `${op.badge} cursor-default`
                              : 'text-gray-500 border border-gray-200 hover:border-brand hover:text-brand'
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
