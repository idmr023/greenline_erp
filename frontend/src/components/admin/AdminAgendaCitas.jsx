import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { citasAPI } from '../../lib/api';
import { ModalCita, ESTADO_BADGE, ESTADO_LABEL } from './AdminCitas';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, X, Loader2, AlertCircle, MapPin,
} from '../../lib/icons';

/**
 * Vista de AGENDA POR SEMANA (agenda por vacantes, sin horas).
 *
 * · Cada columna es un día: cupo (`vacantes_dia`), ocupadas y lo que queda.
 * · Sólo los días que la tienda atiende aceptan citas (Surco L–V).
 * · Alcance: cada tienda ve SU agenda (scopeToOwnStoreId en el servidor);
 *   quien no tiene tienda asignada (roles globales: jefe/admin) puede
 *   cambiar de tienda con el filtro superior.
 * · Clic en una cita → modal de detalle/estados (reutiliza ModalCita);
 *   clic en «+» de un día → crea la cita (endpoint público POST /citas).
 */

// Espejo de backend/src/domain/schemas/cita.js (MOTIVOS_CITA): el ERP no
// puede importar el backend (repo distinto) — igual que TRANSICIONES en
// AdminCitas. El servidor valida el catálogo en el POST.
const MOTIVOS_CITA = [
  'Revisión general',
  'Mantenimiento preventivo',
  'Diagnóstico de la batería',
  'Cambio de repuesto',
  'Reparación eléctrica',
];

const DOW_LABEL = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

// America/Lima (UTC-5, sin DST): "hoy" para decidir la semana inicial.
const hoyISO = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const sumarDias = (iso, dias) =>
  new Date(new Date(`${iso}T12:00:00Z`).getTime() + dias * 24 * 3600 * 1000).toISOString().slice(0, 10);
/** Lunes de la semana a la que pertenece `iso` (la columna 1 de la rejilla). */
const lunesDe = (iso) => {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0=domingo
  return sumarDias(iso, dow === 0 ? -6 : 1 - dow);
};
/** Ventana máxima de navegación hacia delante: hasta ≤ hoy + 60 días. */
const MAX_SEMANA = sumarDias(hoyISO(), 54);

const fmtCorto = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  });

export default function AdminAgendaCitas() {
  const { accessToken, ability, user } = useAuth();
  const puedeEditar = ability.can('update', 'citas');
  // Alcance por tienda (users.store_id → greenline_stores.id). Sólo los
  // roles globales (sin tienda asignada) ven el selector de tiendas.
  const tiendaPropia = user?.storeId || '';

  const [tiendas, setTiendas] = useState([]);
  const [tiendaId, setTiendaId] = useState(tiendaPropia);
  const [semana, setSemana] = useState(() => lunesDe(hoyISO()));
  const [disp, setDisp] = useState(null);
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(null); // cita abierta en ModalCita
  const [nuevaEn, setNuevaEn] = useState(null); // fecha 'AAAA-MM-DD' | null

  // Catálogo de tiendas con servicio técnico (público).
  useEffect(() => {
    citasAPI.tiendas()
      .then((d) => setTiendas(d.tiendas || []))
      .catch(() => setTiendas([]));
  }, []);

  // Sin tienda propia (roles globales): por defecto la primera del catálogo.
  useEffect(() => {
    if (!tiendaPropia && !tiendaId && tiendas.length > 0) {
      setTiendaId(tiendas[0].id);
    }
  }, [tiendaPropia, tiendaId, tiendas]);

  const cargar = useCallback(() => {
    if (!tiendaId) {
      setCargando(false);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    const hasta = sumarDias(semana, 6);
    Promise.all([
      citasAPI.disponibilidad({ tiendaId, desde: semana, hasta }),
      citasAPI.listar({ desde: semana, hasta, tiendaId, pageSize: 100 }, accessToken),
    ])
      .then(([d, c]) => {
        if (cancelado) return;
        setDisp(d);
        setCitas(c.citas || []);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err?.error || err?.message || 'No se pudo cargar la agenda.');
        setDisp(null);
        setCitas([]);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => { cancelado = true; };
  }, [tiendaId, semana, accessToken]);

  useEffect(() => {
    const cancelar = cargar();
    return cancelar;
  }, [cargar]);

  // Citas agrupadas por día (la lista viene en orden descendente).
  const citasPorDia = useMemo(() => {
    const porDia = new Map();
    for (const c of citas) {
      const dia = String(c.fecha).slice(0, 10);
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push(c);
    }
    for (const lista of porDia.values()) {
      lista.sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre, 'es'));
    }
    return porDia;
  }, [citas]);

  const dias = disp?.dias || [];
  const tiendaSel = tiendas.find((t) => t.id === tiendaId);

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-brand" /> Agenda de citas
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Vista semanal por vacantes: cada día indica cuántas citas caben en la tienda.
          </p>
        </div>
        {puedeEditar && tiendaId && (
          <button
            type="button"
            onClick={() => setNuevaEn(hoyISO())}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Nueva cita
          </button>
        )}
      </div>

      {/* Filtros: semana + tienda */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSemana((s) => sumarDias(s, -7))}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4" /> Semana anterior
          </button>
          <span className="text-sm font-semibold text-gray-800 px-2">
            {dias.length > 0
              ? `${fmtCorto(dias[0].fecha)} – ${fmtCorto(dias[dias.length - 1].fecha)}`
              : `${fmtCorto(semana)} – ${fmtCorto(sumarDias(semana, 6))}`}
          </span>
          <button
            type="button"
            onClick={() => setSemana((s) => Math.min(sumarDias(s, 7), MAX_SEMANA))}
            disabled={semana >= MAX_SEMANA}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Semana siguiente <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setSemana(lunesDe(hoyISO()))}
            className="px-3 py-2 rounded-lg text-sm font-medium text-brand hover:bg-brand/10"
          >
            Hoy
          </button>
        </div>

        {tiendaPropia ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/10 text-brand text-xs font-semibold">
            <MapPin className="w-3.5 h-3.5" />
            {tiendaSel ? tiendaSel.name : 'Mi tienda'}
          </span>
        ) : (
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500">
            Tienda
            <select
              value={tiendaId}
              onChange={(e) => setTiendaId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white font-normal"
            >
              {tiendas.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Estado */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {!tiendaId && !tiendaPropia && !cargando && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
          Esta cuenta no tiene tienda asignada: no hay agenda que mostrar.
        </div>
      )}

      {cargando ? (
        <div className="text-gray-400 text-sm py-16 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando agenda…
        </div>
      ) : dias.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          No hay datos de disponibilidad para esta tienda.
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-cols-7 gap-2 min-w-[900px]">
            {dias.map((d) => {
              const lista = citasPorDia.get(d.fecha) || [];
              return (
                <div key={d.fecha} className="flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden min-h-[220px]">
                  {/* Cabecera del día */}
                  <div className={`px-2 py-2 text-center border-b ${d.atiende ? 'bg-gray-50 border-gray-100' : 'bg-gray-100 border-gray-200'}`}>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                      {DOW_LABEL[d.dow - 1]}
                    </p>
                    <p className={`text-lg font-bold leading-tight ${d.atiende ? 'text-gray-900' : 'text-gray-400'}`}>
                      {Number(d.fecha.slice(8, 10))}
                    </p>
                    <p
                      className={`text-[10px] font-semibold mt-0.5 ${
                        !d.atiende ? 'text-gray-400' : d.libres > 0 ? 'text-emerald-600' : 'text-red-500'
                      }`}
                    >
                      {!d.atiende ? 'No atiende' : `${d.libres} de ${d.capacidad} libres`}
                    </p>
                  </div>

                  {/* Citas del día */}
                  <div className="flex-1 p-1.5 space-y-1.5">
                    {lista.length === 0 && (
                      <p className="text-[11px] text-gray-300 text-center py-4">Sin citas</p>
                    )}
                    {lista.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSel(c)}
                        className="w-full text-left px-2 py-1.5 rounded-lg border border-gray-200 hover:border-brand hover:bg-brand/5 transition-colors"
                      >
                        <p className="text-xs font-semibold text-gray-900 truncate">{c.clienteNombre}</p>
                        <p className="text-[11px] text-gray-500 truncate">{c.vehiculo}</p>
                        <span
                          className={`inline-block mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            ESTADO_BADGE[c.estado] || ''
                          }`}
                        >
                          {ESTADO_LABEL[c.estado] || c.estado}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Añadir cita al día */}
                  {puedeEditar && d.atiende && d.libres > 0 && (
                    <button
                      type="button"
                      onClick={() => setNuevaEn(d.fecha)}
                      className="flex items-center justify-center gap-1 py-1.5 border-t border-dashed border-gray-200 text-[11px] font-semibold text-gray-500 hover:text-brand hover:bg-brand/5 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Añadir cita
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de detalle (mismo que la tabla de Citas) */}
      {sel && (
        <ModalCita
          cita={sel}
          puedeEditar={puedeEditar}
          accessToken={accessToken}
          onClose={() => setSel(null)}
          onUpdated={(c) => setSel(c)}
          onChanged={cargar}
        />
      )}

      {/* Modal de creación */}
      {nuevaEn && (
        <ModalNuevaCita
          fecha={nuevaEn}
          tiendaId={tiendaId}
          onClose={() => setNuevaEn(null)}
          onCreada={() => {
            setNuevaEn(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Modal de creación (recepción: walk-in / teléfono)
// ============================================================

function ModalNuevaCita({ fecha, tiendaId, onClose, onCreada }) {
  const [f, setF] = useState({
    clienteNombre: '',
    clienteEmail: '',
    clienteTelefono: '',
    vehiculo: '',
    placa: '',
    servicio: MOTIVOS_CITA[0],
    notas: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand';

  const submit = async (e) => {
    e.preventDefault();
    if (!f.clienteNombre.trim() || !f.clienteEmail.trim() || !f.vehiculo.trim() || !f.clienteTelefono.trim()) {
      setError('Nombre, correo, teléfono y vehículo son obligatorios.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await citasAPI.crear({
        clienteNombre: f.clienteNombre.trim(),
        clienteEmail: f.clienteEmail.trim(),
        clienteTelefono: f.clienteTelefono.trim(),
        vehiculo: f.vehiculo.trim(),
        placa: f.placa.trim(),
        servicio: f.servicio,
        notas: f.notas.trim(),
        tiendaId,
        fecha,
      });
      onCreada();
    } catch (err) {
      setError(err?.error || err?.message || 'No se pudo crear la cita.');
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Nueva cita</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Fecha: {new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-PE', {
                weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
              })}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-4 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-gray-600">
              Nombre del cliente *
              <input type="text" value={f.clienteNombre} onChange={set('clienteNombre')} maxLength={120} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Correo electrónico *
              <input
                type="email"
                value={f.clienteEmail}
                onChange={set('clienteEmail')}
                maxLength={160}
                placeholder="Para la confirmación por correo"
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Teléfono / WhatsApp *
              <input type="tel" value={f.clienteTelefono} onChange={set('clienteTelefono')} maxLength={30} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Vehículo *
              <input type="text" value={f.vehiculo} onChange={set('vehiculo')} maxLength={160} placeholder="Ej: GreenLine GL-1" className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Placa
              <input type="text" value={f.placa} onChange={set('placa')} maxLength={20} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Motivo de la cita
              <select value={f.servicio} onChange={set('servicio')} className={`${inputCls} mt-1`}>
                {MOTIVOS_CITA.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="text-xs font-semibold text-gray-600 block">
            Notas
            <textarea
              value={f.notas}
              onChange={set('notas')}
              maxLength={2000}
              rows={3}
              placeholder="Síntomas, detalle del trabajo…"
              className={`${inputCls} mt-1`}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear cita
            </button>
          </div>
          <p className="text-[11px] text-gray-400 pb-2">
            El cliente recibirá la confirmación por correo (requerido).
          </p>
        </form>
      </div>
    </div>
  );
}
