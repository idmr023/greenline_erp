import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { citasAPI } from '../../lib/api';
import {
  Calendar, Clock, RefreshCw, Eye, CheckCircle2, AlertCircle, X,
  ExternalLink, MessageCircle, Download, Plus, Trash2, Mail, Wrench,
} from '../../lib/icons';

// Transiciones permitidas (espejo de backend/src/domain/schemas/cita.js;
// el backend las valida igual, esto es sólo para habilitar botones).
const TRANSICIONES = {
  pendiente: ['confirmada', 'cancelada', 'rechazada'],
  confirmada: ['completada', 'cancelada'],
  completada: [],
  cancelada: [],
  rechazada: [],
};

const ESTADO_BADGE = {
  pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmada: 'bg-blue-50 text-blue-700 border-blue-200',
  completada: 'bg-green-50 text-green-700 border-green-200',
  cancelada: 'bg-gray-100 text-gray-500 border-gray-200',
  rechazada: 'bg-red-50 text-red-700 border-red-200',
};

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  rechazada: 'Rechazada',
};

function formatFecha(iso) {
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}

export default function AdminCitas() {
  const { accessToken, ability } = useAuth();
  const puedeEditar = ability.can('update', 'citas');

  const [tab, setTab] = useState('citas');

  // ---- datos compartidos ----
  const [tiendas, setTiendas] = useState([]);

  useEffect(() => {
    citasAPI.tiendas()
      .then((d) => setTiendas(d.tiendas || []))
      .catch(() => setTiendas([]));
  }, []);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-brand" /> Citas de servicio técnico
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Agenda por tienda. Las tiendas se enteran por correo (Google Calendar + .ics + acciones con token).
          </p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[
          { key: 'citas', label: 'Citas' },
          { key: 'destinatarios', label: 'Correos por tienda' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors ${
              tab === t.key
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'citas'
        ? <TabCitas accessToken={accessToken} puedeEditar={puedeEditar} tiendas={tiendas} />
        : <TabDestinatarios accessToken={accessToken} puedeEditar={puedeEditar} tiendas={tiendas} />}
    </div>
  );
}

// ============================================================
// Tabla de citas
// ============================================================

function TabCitas({ accessToken, puedeEditar, tiendas }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);

  const [filtros, setFiltros] = useState({ estado: '', fecha: '', tiendaId: '', q: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await citasAPI.listar(
        { ...filtros, pageSize: 50 },
        accessToken,
      );
      setItems(data.citas || []);
      setTotal(data.total || 0);
    } catch (err) {
      setLoadError(err?.message || 'Error cargando citas');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filtros, accessToken]);

  useEffect(() => { load(); }, [load]);

  async function abrirDetalle(cita) {
    try {
      const completa = await citasAPI.obtener(cita.id, accessToken);
      setSelected(completa);
    } catch {
      setSelected(cita); // al menos la fila
    }
  }

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <label className="text-xs text-gray-500">
          Estado
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
          >
            <option value="">Todos</option>
            {Object.entries(ESTADO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Fecha
          <input
            type="date"
            value={filtros.fecha}
            onChange={(e) => setFiltros({ ...filtros, fecha: e.target.value })}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
          />
        </label>
        {tiendas.length > 1 && (
          <label className="text-xs text-gray-500">
            Tienda
            <select
              value={filtros.tiendaId}
              onChange={(e) => setFiltros({ ...filtros, tiendaId: e.target.value })}
              className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
            >
              <option value="">Todas</option>
              {tiendas.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-gray-500 flex-1 min-w-[200px]">
          Buscar
          <input
            type="text"
            placeholder="Nombre, correo, placa o vehículo…"
            value={filtros.q}
            onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
            className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white w-full"
          />
        </label>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Recargar
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Cargando citas...</div>
      ) : loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-sm">
          <p className="font-semibold mb-1">Error cargando citas</p>
          <p className="text-red-600">{loadError}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          No hay citas con esos filtros.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">Fecha / Hora</th>
                  <th className="p-4">Tienda</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Vehículo</th>
                  <th className="p-4">Servicio</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 whitespace-nowrap">
                      <p className="font-semibold text-gray-900">{formatFecha(c.fecha)}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {c.horaInicio}–{c.horaFin}
                      </p>
                    </td>
                    <td className="p-4 text-gray-700">{c.tienda?.name || '—'}</td>
                    <td className="p-4">
                      <p className="font-semibold text-gray-900">{c.clienteNombre}</p>
                      <p className="text-xs text-gray-500">
                        {[c.clienteEmail, c.clienteTelefono].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </td>
                    <td className="p-4 text-gray-700">
                      <p className="truncate max-w-[180px]">{c.vehiculo}</p>
                      {c.placa && <p className="text-xs text-gray-400">{c.placa}</p>}
                    </td>
                    <td className="p-4 text-gray-700 truncate max-w-[160px]">{c.servicio}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${ESTADO_BADGE[c.estado] || ''}`}>
                        {ESTADO_LABEL[c.estado] || c.estado}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => abrirDetalle(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <Eye className="w-3.5 h-3.5" /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">
            {items.length} de {total} cita(s)
          </div>
        </div>
      )}

      {selected && (
        <ModalCita
          cita={selected}
          puedeEditar={puedeEditar}
          accessToken={accessToken}
          onClose={() => setSelected(null)}
          onUpdated={(c) => setSelected(c)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ============================================================
// Modal de detalle + transiciones
// ============================================================

function ModalCita({ cita, puedeEditar, accessToken, onClose, onUpdated, onChanged }) {
  const [notasAdmin, setNotasAdmin] = useState(cita.notasAdmin || '');
  const [motivoRechazo, setMotivoRechazo] = useState(cita.motivoRechazo || '');
  const [accionando, setAccionando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const permitidas = TRANSICIONES[cita.estado] || [];

  async function transicion(nuevoEstado) {
    if (nuevoEstado === 'rechazada' && !motivoRechazo.trim()) {
      setError('Indica el motivo del rechazo.');
      return;
    }
    if (!window.confirm(`¿${nuevoEstado === 'rechazada' ? 'Rechazar' : nuevoEstado === 'cancelada' ? 'Cancelar' : 'Pasar a ' + nuevoEstado} esta cita? Se avisará a la tienda y al cliente.`)) {
      return;
    }
    setAccionando(true);
    setError(null);
    try {
      const actualizada = await citasAPI.actualizar(
        cita.id,
        {
          estado: nuevoEstado,
          ...(nuevoEstado === 'rechazada' ? { motivoRechazo: motivoRechazo.trim() } : {}),
        },
        accessToken,
      );
      onUpdated(actualizada);
      setAviso(`Cita ${ESTADO_LABEL[nuevoEstado].toLowerCase()}. Correos encolados.`);
      onChanged();
    } catch (err) {
      setError(err?.error || err?.message || 'No se pudo actualizar la cita.');
    } finally {
      setAccionando(false);
    }
  }

  async function guardarNotas() {
    setAccionando(true);
    setError(null);
    try {
      const actualizada = await citasAPI.actualizar(cita.id, { notasAdmin }, accessToken);
      onUpdated(actualizada);
      setAviso('Notas guardadas.');
    } catch (err) {
      setError(err?.error || err?.message || 'No se pudieron guardar las notas.');
    } finally {
      setAccionando(false);
    }
  }

  async function reenviarCorreo() {
    setAccionando(true);
    setError(null);
    try {
      const r = await citasAPI.reenviarEmail(cita.id, accessToken);
      setAviso(`Correo reenviado a ${r.enviados} destinatario(s).`);
    } catch (err) {
      setError(err?.error || err?.message || 'No se pudo reenviar el correo.');
    } finally {
      setAccionando(false);
    }
  }

  const urls = cita.urls || {};

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Cita — {formatFecha(cita.fecha)} {cita.horaInicio}</h2>
            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${ESTADO_BADGE[cita.estado] || ''}`}>
              {ESTADO_LABEL[cita.estado] || cita.estado}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 text-sm">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">{error}</div>
          )}
          {aviso && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-xs">{aviso}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Dato label="Tienda" valor={cita.tienda ? `${cita.tienda.name} — ${cita.tienda.address}` : '—'} />
            <Dato label="Horario" valor={`${cita.horaInicio}–${cita.horaFin} (hora de Perú)`} />
            <Dato label="Cliente" valor={cita.clienteNombre} />
            <Dato label="Contacto" valor={[cita.clienteEmail, cita.clienteTelefono].filter(Boolean).join(' · ') || '—'} />
            <Dato label="Vehículo" valor={[cita.vehiculo, cita.placa && `Placa ${cita.placa}`].filter(Boolean).join(' · ')} />
            <Dato label="Servicio" valor={cita.servicio} />
            {cita.notas && <Dato label="Notas del cliente" valor={cita.notas} className="col-span-2" />}
            {cita.motivoRechazo && <Dato label="Motivo de rechazo" valor={cita.motivoRechazo} className="col-span-2" />}
          </div>

          {/* Acciones de un clic (mismos links que llegan por correo) */}
          <div className="flex flex-wrap gap-2 pt-2">
            {urls.urlGestion && (
              <a href={urls.urlGestion} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir gestión con token
              </a>
            )}
            {urls.urlIcs && (
              <a href={urls.urlIcs}
                 className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50">
                <Download className="w-3.5 h-3.5" /> .ics
              </a>
            )}
            {urls.urlWhatsapp && (
              <a href={urls.urlWhatsapp} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp al cliente
              </a>
            )}
            {puedeEditar && (
              <button onClick={reenviarCorreo} disabled={accionando}
                 className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                <Mail className="w-3.5 h-3.5" /> Reenviar correo a tienda
              </button>
            )}
          </div>

          {/* Transiciones de estado */}
          {puedeEditar && permitidas.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cambiar estado</p>
              {cita.estado === 'pendiente' && (
                <label className="block text-xs text-gray-500 mb-2">
                  Motivo de rechazo (si rechazas)
                  <input
                    type="text"
                    value={motivoRechazo}
                    onChange={(e) => setMotivoRechazo(e.target.value)}
                    placeholder="Ej: no hay repuestos esta semana"
                    className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 w-full"
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                {permitidas.includes('confirmada') && (
                  <BotonEstado color="green" disabled={accionando} onClick={() => transicion('confirmada')}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar
                  </BotonEstado>
                )}
                {permitidas.includes('completada') && (
                  <BotonEstado color="green" disabled={accionando} onClick={() => transicion('completada')}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Marcar completada
                  </BotonEstado>
                )}
                {permitidas.includes('rechazada') && (
                  <BotonEstado color="red" disabled={accionando} onClick={() => transicion('rechazada')}>
                    <X className="w-3.5 h-3.5" /> Rechazar
                  </BotonEstado>
                )}
                {permitidas.includes('cancelada') && (
                  <BotonEstado color="gray" disabled={accionando} onClick={() => transicion('cancelada')}>
                    <AlertCircle className="w-3.5 h-3.5" /> Cancelar
                  </BotonEstado>
                )}
              </div>
            </div>
          )}

          {/* Notas internas */}
          {puedeEditar && (
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Notas internas (no se envían por correo)
              </label>
              <textarea
                value={notasAdmin}
                onChange={(e) => setNotasAdmin(e.target.value)}
                rows={3}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 w-full"
              />
              <button
                onClick={guardarNotas}
                disabled={accionando}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              >
                Guardar notas
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Dato({ label, valor, className = '' }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-gray-800 mt-0.5">{valor}</p>
    </div>
  );
}

function BotonEstado({ color, children, ...props }) {
  const colores = {
    green: 'bg-green-600 text-white hover:bg-green-700',
    red: 'bg-red-600 text-white hover:bg-red-700',
    gray: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${colores[color]}`}
    >
      {children}
    </button>
  );
}

// ============================================================
// Destinatarios (correos que reciben los avisos de cada tienda)
// ============================================================

function TabDestinatarios({ accessToken, puedeEditar, tiendas }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ tiendaId: '', nombre: '', email: '' });
  const [guardando, setGuardando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await citasAPI.destinatarios({}, accessToken);
      setItems(data.destinatarios || []);
    } catch (err) {
      setLoadError(err?.message || 'Error cargando destinatarios');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  async function agregar(e) {
    e.preventDefault();
    if (!form.tiendaId || !form.email.trim()) return;
    setGuardando(true);
    try {
      await citasAPI.crearDestinatario(
        { tiendaId: form.tiendaId, nombre: form.nombre.trim() || undefined, email: form.email.trim() },
        accessToken,
      );
      setForm({ ...form, nombre: '', email: '' });
      load();
    } catch (err) {
      alert(err?.error || err?.message || 'No se pudo guardar el destinatario.');
    } finally {
      setGuardando(false);
    }
  }

  async function desactivar(d) {
    if (!window.confirm(`¿Quitar ${d.email} de los correos de ${d.tienda?.name || 'la tienda'}?`)) return;
    try {
      await citasAPI.desactivarDestinatario(d.id, accessToken);
      load();
    } catch (err) {
      alert(err?.error || err?.message || 'No se pudo desactivar.');
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Cada cita nueva avía por correo a <strong>todos</strong> estos destinatarios (máx. recomendado: 2–3 por tienda).
      </p>

      {puedeEditar && (
        <form onSubmit={agregar} className="bg-white rounded-xl border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end shadow-sm">
          <label className="text-xs text-gray-500">
            Tienda *
            <select
              required
              value={form.tiendaId}
              onChange={(e) => setForm({ ...form, tiendaId: e.target.value })}
              className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
            >
              <option value="">Selecciona…</option>
              {tiendas.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            Nombre (opcional)
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Jefe de taller"
              className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
            />
          </label>
          <label className="text-xs text-gray-500 flex-1 min-w-[220px]">
            Correo *
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="taller@tienda.pe"
              className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 w-full"
            />
          </label>
          <button
            type="submit"
            disabled={guardando}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Cargando destinatarios...</div>
      ) : loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-sm">{loadError}</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          Sin destinatarios: las tiendas NO recibirán los correos de citas hasta que agregues al menos uno.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="p-4">Tienda</th>
                <th className="p-4">Nombre</th>
                <th className="p-4">Correo</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((d) => (
                <tr key={d.id} className={d.activo ? '' : 'opacity-50'}>
                  <td className="p-4 text-gray-700">{d.tienda?.name || '—'}</td>
                  <td className="p-4 text-gray-700">{d.nombre || '—'}</td>
                  <td className="p-4 text-gray-900 font-medium">{d.email}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${d.activo ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {d.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {puedeEditar && d.activo && (
                      <button
                        onClick={() => desactivar(d)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Quitar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
