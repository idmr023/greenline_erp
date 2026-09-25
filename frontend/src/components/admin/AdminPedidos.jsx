import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../lib/utils';
import { Package, ChevronDown, Phone, Mail, RefreshCw } from '../../lib/icons';
import { CONTACT } from '../../lib/config';
import { pedidosAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

const ESTADOS = [
  { value: 'NUEVO', label: 'Nuevo', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700', next: ['EN_PROCESO'] },
  { value: 'EN_PROCESO', label: 'En proceso', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700', next: ['CONTACTADO'] },
  { value: 'CONTACTADO', label: 'Contactado', dot: 'bg-purple-500', badge: 'bg-purple-50 text-purple-700', next: ['COMPLETADO', 'CANCELADO'] },
  { value: 'COMPLETADO', label: 'Completado', dot: 'bg-green-500', badge: 'bg-green-50 text-green-700', next: [] },
  { value: 'CANCELADO', label: 'Cancelado', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700', next: [] },
];

const est = (v) => ESTADOS.find((e) => e.value === v) || ESTADOS[0];

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
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);

  useEffect(() => {
    load();
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
  }

  async function changeEstado(pedido, next) {
    if (!next) return;
    setSavingId(pedido.id);
    const { error: err } = await supabase
      .from('pedidos')
      .update({ estado: next })
      .eq('id', pedido.id);
    setSavingId(null);
    if (err) {
      alert('No se pudo actualizar el estado.');
      return;
    }
    setPedidos((prev) =>
      prev.map((p) => (p.id === pedido.id ? { ...p, estado: next } : p)),
    );
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

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pedidos realizados desde la tienda web. Actualiza el estado conforme avanza la
            atención.
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

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
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