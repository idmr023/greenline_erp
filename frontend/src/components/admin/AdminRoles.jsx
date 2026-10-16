import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAbility } from '@casl/react';
import { useAuth } from '../../contexts/AuthContext';
import { rolesAPI } from '../../lib/api';
import { Check, List, Loader2, Pencil, Plus, ShieldCheck, SlidersHorizontal, Trash2, X } from '../../lib/icons';
import AdminRolesArbol from './AdminRolesArbol';

const NIVELES = [
  ['SUPER', 'Super'],
  ['ALMACEN', 'Almacén'],
  ['TIENDA', 'Tienda'],
  ['CONTENIDO', 'Contenido'],
  ['CLIENTE_N', 'Cliente'],
];

/** Anti-lockout (idéntico al backend): ADMIN no se borra, no pierde panel ni baja de nivel. */
const ES_ADMIN = (rol) => rol === 'ADMIN';

const mensajeDe = (err, porDefecto) => {
  const base = err?.error || err?.message || porDefecto;
  const detalles =
    err?.details && typeof err.details === 'object'
      ? Object.entries(err.details)
          .map(([campo, fallos]) => `${campo}: ${[].concat(fallos || []).join(', ')}`)
          .join(' · ')
      : '';
  return detalles ? `${base} — ${detalles}` : base;
};

export default function AdminRoles() {
  const { accessToken } = useAuth();
  const ability = useAbility();
  /** Escritura: crear/editar/borrar roles y su matriz de permisos. */
  const puedeEscribir = ability.can('manage-roles', 'usuarios');

  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [fuente, setFuente] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: '', etiqueta: '', nivel: 'CONTENIDO', panel: false });
  const [guardando, setGuardando] = useState(false);
  const [accionando, setAccionando] = useState(null);
  const [vista, setVista] = useState('lista');

  // Editor de la matriz de permisos (PUT /roles/:rol/permisos).
  const [matrizDe, setMatrizDe] = useState(null);
  const [seleccion, setSeleccion] = useState([]);
  const [guardandoMatriz, setGuardandoMatriz] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await rolesAPI.listar(accessToken);
      setRoles(res?.roles || []);
      setPermisos(res?.permisos || []);
      setFuente(res?.fuente || null);
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo cargar el catálogo de roles.'));
    } finally {
      setCargando(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Los permisos llegan planos con `grupo`: el editor los pinta por bloque. */
  const grupos = useMemo(() => {
    const out = [];
    for (const p of permisos) {
      const g = out.find((x) => x.grupo === p.grupo);
      if (g) g.claves.push(p.clave);
      else out.push({ grupo: p.grupo, claves: [p.clave] });
    }
    return out;
  }, [permisos]);

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ nombre: '', etiqueta: '', nivel: 'CONTENIDO', panel: false });
    setFormAbierto(true);
    setMensaje(null);
  };

  const abrirEdicion = (rol) => {
    setEditando(rol);
    setForm({
      nombre: rol.nombre,
      etiqueta: rol.etiqueta || '',
      nivel: rol.nivel || 'CONTENIDO',
      panel: !!rol.panel,
    });
    setFormAbierto(true);
    setMensaje(null);
  };

  const abrirMatriz = (rol) => {
    setMatrizDe(rol);
    setSeleccion([...(rol.permisos || [])]);
    setMensaje(null);
  };

  const guardar = async (e) => {
    e?.preventDefault?.();
    setGuardando(true);
    setMensaje(null);
    try {
      if (editando) {
        await rolesAPI.actualizar(editando.nombre, {
          etiqueta: form.etiqueta,
          nivel: form.nivel,
          panel: form.panel,
        }, accessToken);
      } else {
        await rolesAPI.crear({
          nombre: form.nombre.trim().toUpperCase(),
          etiqueta: form.etiqueta,
          nivel: form.nivel,
          panel: form.panel,
        }, accessToken);
      }
      setFormAbierto(false);
      setMensaje({ tipo: 'ok', texto: 'Rol guardado. Los permisos de las sesiones vivas se recargan solos.' });
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDe(err, 'No se pudo guardar el rol.') });
    } finally {
      setGuardando(false);
    }
  };

  const guardarMatriz = async () => {
    setGuardandoMatriz(true);
    setMensaje(null);
    try {
      await rolesAPI.setPermisos(matrizDe.nombre, seleccion, accessToken);
      setMatrizDe(null);
      setMensaje({ tipo: 'ok', texto: `Permisos de ${matrizDe.nombre} actualizados.` });
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDe(err, 'No se pudieron guardar los permisos.') });
    } finally {
      setGuardandoMatriz(false);
    }
  };

  const eliminar = async (rol) => {
    const seguro = window.confirm(
      `¿Borrar el rol ${rol.nombre}?\n\nSólo es posible si ninguna cuenta lo usa todavía. ` +
      'Esta acción no se puede deshacer.',
    );
    if (!seguro) return;
    setAccionando(rol.nombre);
    setMensaje(null);
    try {
      await rolesAPI.eliminar(rol.nombre, accessToken);
      setMensaje({ tipo: 'ok', texto: `Rol ${rol.nombre} eliminado.` });
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDe(err, `No se pudo eliminar ${rol.nombre}.`) });
    } finally {
      setAccionando(null);
    }
  };

  const alternarSeleccion = (clave) =>
    setSeleccion((s) => (s.includes(clave) ? s.filter((c) => c !== clave) : [...s, clave]));

  const alternarGrupo = (claves) => {
    const todas = claves.every((c) => seleccion.includes(c));
    setSeleccion((s) => (todas
      ? s.filter((c) => !claves.includes(c))
      : [...new Set([...s, ...claves])]));
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Roles y permisos</h1>
          <p className="text-sm text-gray-500 mt-1">
            La matriz de permisos vive en el backend; aquí sólo se edita. Un rol nuevo
            sirve en el panel nada más guardarlo, sin desplegar.
          </p>
          {fuente && (
            <p className="text-[11px] text-gray-400 mt-1">
              Fuente vigente: {fuente === 'bd' ? 'base de datos' : 'catálogo del código'} ·
              {' '}{roles.length} rol(es) · {permisos.length} permiso(s)
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setVista('lista')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${
                vista === 'lista' ? 'bg-brand/10 text-brand' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => setVista('arbol')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-l border-gray-200 transition-colors ${
                vista === 'arbol' ? 'bg-brand/10 text-brand' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Árbol
            </button>
          </div>
          {puedeEscribir && (
            <button
              type="button"
              onClick={abrirNuevo}
              className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nuevo rol
            </button>
          )}
        </div>
      </div>

      {mensaje && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void cargar()}
            className="shrink-0 font-semibold underline hover:text-red-900"
          >
            Reintentar
          </button>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-10">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando roles…
        </div>
      ) : vista === 'arbol' ? (
        <AdminRolesArbol
          roles={roles}
          grupos={grupos}
          puedeEscribir={puedeEscribir}
          onEditarPermisos={abrirMatriz}
        />
      ) : (
        <div className="space-y-2">
          {roles.map((rol) => (
            <div
              key={rol.nombre}
              className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3"
            >
              <div className="w-9 h-9 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{rol.nombre}</p>
                  {ES_ADMIN(rol.nombre) && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                      Protegido
                    </span>
                  )}
                  {rol.panel && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand/10 text-brand">
                      Accede al panel
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {rol.etiqueta || '—'} · nivel {rol.nivel || '—'} · {rol.permisos?.length ?? 0} permiso(s)
                </p>
              </div>

              {puedeEscribir && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => abrirMatriz(rol)}
                    className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                    title="Editar permisos"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirEdicion(rol)}
                    className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                    title="Editar datos del rol"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => eliminar(rol)}
                    disabled={ES_ADMIN(rol.nombre) || accionando === rol.nombre}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={ES_ADMIN(rol.nombre) ? 'ADMIN no se puede eliminar' : 'Eliminar rol'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-[11px] text-gray-400">
        Anti-lockout: ADMIN no se elimina, no pierde el acceso al panel ni baja de nivel, y
        su matriz sólo se puede ampliar. Las políticas RLS de Postgres comparan por nombre de
        rol: un rol creado aquí gobierna el panel, no el RLS.
      </p>

      {/* Formulario crear / editar */}
      {formAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setFormAbierto(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                {editando ? `Editar ${editando.nombre}` : 'Nuevo rol'}
              </h2>
              <button type="button" onClick={() => setFormAbierto(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
                <input
                  required
                  disabled={!!editando}
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value.toUpperCase() }))}
                  className={`input ${editando ? 'opacity-60' : ''}`}
                  placeholder="GERENTE_SEDE"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  MAYÚSCULAS, números y guion bajo. No se puede renombrar: el RLS usa el nombre.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Etiqueta *</label>
                <input
                  required
                  value={form.etiqueta}
                  onChange={(e) => setForm((f) => ({ ...f, etiqueta: e.target.value }))}
                  className="input"
                  placeholder="Gerente de sede"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nivel de acceso *</label>
                <select
                  value={form.nivel}
                  onChange={(e) => setForm((f) => ({ ...f, nivel: e.target.value }))}
                  className="input"
                  disabled={ES_ADMIN(editando?.nombre)}
                >
                  {NIVELES.map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>{etiqueta}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.panel}
                  disabled={ES_ADMIN(editando?.nombre)}
                  onChange={(e) => setForm((f) => ({ ...f, panel: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
                />
                Accede al panel
              </label>

              {mensaje?.tipo === 'error' && (
                <p className="text-xs font-medium text-red-600">{mensaje.texto}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormAbierto(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
                >
                  {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Check className="w-4 h-4" />
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Matriz de permisos */}
      {matrizDe && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setMatrizDe(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-gray-900">Permisos de {matrizDe.nombre}</h2>
              <button type="button" onClick={() => setMatrizDe(null)} className="p-1.5 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {seleccion.length} de {permisos.length} permisos seleccionados. Al guardar se
              reemplaza el conjunto completo (no se mezcla con lo anterior).
            </p>

            <div className="flex-1 overflow-auto space-y-4 pr-1">
              {grupos.map((g) => {
                const todas = g.claves.every((c) => seleccion.includes(c));
                return (
                  <div key={g.grupo}>
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={todas}
                        onChange={() => alternarGrupo(g.claves)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-brand focus:ring-brand"
                      />
                      {g.grupo}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {g.claves.map((clave) => (
                        <label
                          key={clave}
                          className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer rounded-lg border border-gray-100 px-2 py-1.5 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={seleccion.includes(clave)}
                            onChange={() => alternarSeleccion(clave)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-brand focus:ring-brand"
                          />
                          {clave}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setMatrizDe(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarMatriz}
                disabled={guardandoMatriz}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
              >
                {guardandoMatriz && <Loader2 className="w-4 h-4 animate-spin" />}
                <Check className="w-4 h-4" />
                Aplicar permisos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
