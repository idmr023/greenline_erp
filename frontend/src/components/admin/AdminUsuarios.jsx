import { useCallback, useEffect, useState } from 'react';
import { useAbility } from '@casl/react';
import { useAuth } from '../../contexts/AuthContext';
import { usuariosAPI } from '../../lib/api';
import { rolesDe } from '../../lib/roles';
import { Check, Loader2, RefreshCw, Pencil, Plus, Search, ShieldCheck, Trash2, Users, X } from '../../lib/icons';

/** Roles que el backend acepta en POST/PUT /users (zod del users.routes). */
const ROLES_DISPONIBLES = [
  ['ADMIN', 'Administrador'],
  ['DESARROLLADOR_WEB', 'Desarrollador web'],
  ['EDITORA_BLOG', 'Editora de blog'],
  ['DISTRIBUCION', 'Distribución'],
  ['REDES_SOCIALES', 'Redes sociales'],
  ['GERENTE_TIENDA', 'Gerente de tienda'],
  ['COLABORADOR_TIENDA', 'Colaborador de tienda'],
  ['GERENTE_ALMACEN', 'Gerente de almacén'],
  ['COLABORADOR_ALMACEN', 'Colaborador de almacén'],
  ['CLIENTE', 'Cliente'],
];

const ETIQUETA_ROL = Object.fromEntries(ROLES_DISPONIBLES);
const LIMITE = 20;

const CONTRASENA_ESTANDAR = 'greenline@2026';

const FORM_VACIO = {
  nombre: '',
  apellido: '',
  email: '',
  telefono: '',
  roles: ['COLABORADOR_TIENDA'],
  activo: true,
  password: CONTRASENA_ESTANDAR,
};

/**
 * `request()` lanza `{ status, error, details }` con el JSON del backend.
 * En un 400 de zod, `details` trae el campo que ha fallado: sin él el
 * mensaje se queda en un inútil «Validación fallida».
 */
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

export default function AdminUsuarios() {
  const { user, accessToken } = useAuth();
  const ability = useAbility();
  /** Alta/baja y edición de cuentas: usuarios:create/update/delete. */
  const puedeEscribir = ability.can('update', 'usuarios');
  /** El correo es la credencial de acceso: sólo un ADMIN lo cambia (§RBAC). */
  const esAdmin = ability.can('manage-roles', 'usuarios');

  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('');

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [accionando, setAccionando] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await usuariosAPI.listar(
        { page: pagina, limit: LIMITE, search: busqueda, rol: filtroRol },
        accessToken,
      );
      setLista(res?.users || []);
      setTotal(res?.pagination?.total ?? 0);
      setTotalPaginas(res?.pagination?.totalPages ?? 1);
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo cargar el listado de usuarios.'));
    } finally {
      setCargando(false);
    }
  }, [accessToken, busqueda, filtroRol, pagina]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const buscar = (e) => {
    e?.preventDefault?.();
    setPagina(1);
    setBusqueda(q.trim());
  };

  const abrirNuevo = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setFormAbierto(true);
    setMensaje(null);
  };

  const abrirEdicion = (u) => {
    setEditando(u);
    setForm({
      nombre: u.nombre || '',
      apellido: u.apellido || '',
      email: u.email || '',
      telefono: u.telefono || '',
      roles: rolesDe(u).length > 0 ? rolesDe(u) : ['COLABORADOR_TIENDA'],
      activo: u.activo !== false,
    });
    setFormAbierto(true);
    setMensaje(null);
  };

  const setCampo = (clave, valor) => setForm((f) => ({ ...f, [clave]: valor }));

  /**
   * Alterna un rol en el conjunto. Reglas de la UI, las mismas que el backend:
   *  - al menos un rol (se valida al guardar);
   *  - CLIENTE no se combina: marcarlo deja sólo CLIENTE y marcar un rol de
   *    equipo quita CLIENTE de la selección.
   */
  const alternarRol = (rol) => {
    setForm((f) => {
      const actuales = Array.isArray(f.roles) ? f.roles : [];
      if (actuales.includes(rol)) {
        return { ...f, roles: actuales.filter((r) => r !== rol) };
      }
      if (rol === 'CLIENTE') return { ...f, roles: ['CLIENTE'] };
      return { ...f, roles: [...actuales.filter((r) => r !== 'CLIENTE'), rol] };
    });
  };

  const guardar = async (e) => {
    e?.preventDefault?.();
    setGuardando(true);
    setMensaje(null);

    const rolesSel = [...new Set((form.roles || []).filter(Boolean))];
    if (rolesSel.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Selecciona al menos un rol.' });
      setGuardando(false);
      return;
    }

    try {
      if (editando) {
        const nuevoEmail = form.email.trim();
        const res = await usuariosAPI.actualizar(
          editando.id,
          {
            nombre: form.nombre.trim(),
            apellido: form.apellido.trim(),
            telefono: form.telefono.trim() || null,
            roles: rolesSel,
            activo: form.activo,
            // Sólo viaja si cambió y el rol es ADMIN: el backend también lo
            // comprueba (403) por si alguien lo manda a mano.
            ...(esAdmin && nuevoEmail && nuevoEmail !== editando.email ? { email: nuevoEmail } : {}),
          },
          accessToken,
        );
        setMensaje({
          tipo: res?.aviso ? 'error' : 'ok',
          texto: res?.aviso || 'Usuario actualizado.',
        });
      } else {
        if (!form.password) {
          setMensaje({ tipo: 'error', texto: 'La contraseña es obligatoria para dar de alta.' });
          setGuardando(false);
          return;
        }
        await usuariosAPI.crear(
          {
            email: form.email.trim(),
            password: form.password,
            nombre: form.nombre.trim(),
            apellido: form.apellido.trim(),
            telefono: form.telefono.trim() || undefined,
            roles: rolesSel,
          },
          accessToken,
        );
        setMensaje({ tipo: 'ok', texto: 'Usuario creado.' });
      }
      setFormAbierto(false);
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDe(err, 'No se pudo guardar el usuario.') });
    } finally {
      setGuardando(false);
    }
  };

  const restablecerEstandar = async (u) => {
    const seguro = window.confirm(
      `¿Restablecer la contraseña de "${u.nombre} ${u.apellido}" a la estándar?` +
        '\n\nEl usuario deberá cambiarla en su próximo ingreso y sus sesiones abiertas se cerrarán.',
    );
    if (!seguro) return;
    setAccionando(u.id);
    setMensaje(null);
    try {
      await usuariosAPI.actualizar(u.id, { password: CONTRASENA_ESTANDAR }, accessToken);
      setMensaje({
        tipo: 'ok',
        texto: `Contraseña de ${u.email} restablecida a la estándar. El usuario deberá cambiarla en el próximo ingreso.`,
      });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDe(err, 'No se pudo restablecer la contraseña.') });
    } finally {
      setAccionando(null);
    }
  };

  const alternarActivo = async (u) => {
    setAccionando(u.id);
    setMensaje(null);
    try {
      await usuariosAPI.actualizar(u.id, { activo: !u.activo }, accessToken);
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDe(err, 'No se pudo cambiar el estado.') });
    } finally {
      setAccionando(null);
    }
  };

  const eliminar = async (u) => {
    const seguro = window.confirm(
      `¿Eliminar DEFINITIVAMENTE a "${u.nombre} ${u.apellido}"?\n\n` +
        'Se borra la cuenta y sus datos personales (no es una desactivación). ' +
        'El historial de auditoría y los movimientos de stock se conservan.',
    );
    if (!seguro) return;
    setAccionando(u.id);
    setMensaje(null);
    try {
      const res = await usuariosAPI.eliminar(u.id, accessToken);
      setMensaje({
        tipo: res?.aviso ? 'error' : 'ok',
        texto: res?.aviso || 'Usuario eliminado.',
      });
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDe(err, 'No se pudo eliminar el usuario.') });
    } finally {
      setAccionando(null);
    }
  };

  const esMiCuenta = (u) => u?.id === user?.id;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-brand" />
            Usuarios
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} cuenta(s) · alta, edición, permisos y activación de contraseña
          </p>
        </div>
        {puedeEscribir && (
          <button
            type="button"
            onClick={abrirNuevo}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo usuario
          </button>
        )}
      </div>

      {/* Filtros */}
      <form onSubmit={buscar} className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, apellido o email"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>
        <select
          value={filtroRol}
          onChange={(e) => { setPagina(1); setFiltroRol(e.target.value); }}
          className="input max-w-[220px]"
        >
          <option value="">Todos los roles</option>
          {ROLES_DISPONIBLES.map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>{etiqueta}</option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          Buscar
        </button>
      </form>

      {mensaje && (
        <p
          className={`text-xs mb-3 ${mensaje.tipo === 'error' ? 'text-red-600' : 'text-emerald-700'}`}
          role="status"
        >
          {mensaje.texto}
        </p>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Listado */}
      {cargando ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando usuarios...
        </div>
      ) : lista.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-500">
          {busqueda || filtroRol ? 'Ningún usuario coincide con el filtro.' : 'No hay usuarios todavía.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {lista.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 text-sm">
                    {u.nombre} {u.apellido}
                  </p>
                  <span className="text-[10px] font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded">
                    {ETIQUETA_ROL[u.rol] || u.rol}
                  </span>
                  {rolesDe(u)
                    .filter((rol) => rol !== u.rol)
                    .map((rol) => (
                      <span key={rol} className="text-[10px] font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded">
                        {ETIQUETA_ROL[rol] || rol}
                      </span>
                    ))}
                  {!u.activo && (
                    <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                      Inactivo
                    </span>
                  )}
                  {u.twoFactorEnabled && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      2FA activo
                    </span>
                  )}
                  {esMiCuenta(u) && (
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      Tú
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-0.5 truncate">{u.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {u.ultimoLogin
                    ? `Último acceso: ${new Date(u.ultimoLogin).toLocaleString('es-PE')}`
                    : 'Sin accesos registrados'}
                </p>
              </div>

              <div className="flex items-center gap-1 self-center">
                {puedeEscribir && (
                  <>
                    <button
                      type="button"
                      onClick={() => restablecerEstandar(u)}
                      disabled={accionando === u.id}
                      className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Restablecer a la contraseña estándar"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarActivo(u)}
                      disabled={accionando === u.id || esMiCuenta(u)}
                      className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors disabled:opacity-50"
                      title={u.activo ? 'Desactivar' : 'Activar'}
                    >
                      {u.activo ? <ShieldCheck className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirEdicion(u)}
                      className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                      title="Editar usuario y permisos"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminar(u)}
                      disabled={esMiCuenta(u) || accionando === u.id}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Eliminar definitivamente"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
          >
            Anterior
          </button>
          <span className="text-xs text-gray-500">
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={pagina >= totalPaginas}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
          >
            Siguiente
          </button>
        </div>
      )}

      <p className="mt-6 text-[11px] text-gray-400">
        Los permisos de escritura sobre cada sección se conceden por rol en el panel lateral
        («Acceso al panel»); aquí se asignan los roles de cada cuenta (pueden ser varios).
      </p>

      {/* Formulario crear / editar */}
      {formAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setFormAbierto(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                {editando ? 'Editar usuario' : 'Nuevo usuario'}
              </h2>
              <button
                type="button"
                onClick={() => setFormAbierto(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardar} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
                  <input
                    required
                    value={form.nombre}
                    onChange={(e) => setCampo('nombre', e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Apellido *</label>
                  <input
                    required
                    value={form.apellido}
                    onChange={(e) => setCampo('apellido', e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                {editando && !esAdmin ? (
                  <>
                    <input value={form.email} disabled className="input opacity-60" />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Sólo un administrador puede cambiar el correo.
                    </p>
                  </>
                ) : (
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setCampo('email', e.target.value)}
                    className="input"
                    placeholder="tu@email.com"
                  />
                )}
              </div>

              {!editando && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Contraseña inicial (estándar) *
                  </label>
                  <input
                    required
                    type="password"
                    readOnly
                    value={form.password || CONTRASENA_ESTANDAR}
                    className="input opacity-60"
                    placeholder="Contraseña estándar, oculta"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Contraseña estándar compartida (greenline@2026): el usuario deberá
                    cambiarla en su primer ingreso (queda forzado).
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Teléfono</label>
                <input
                  value={form.telefono}
                  onChange={(e) => setCampo('telefono', e.target.value)}
                  className="input"
                  placeholder="+51 ..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Roles (permisos) *
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {ROLES_DISPONIBLES.map(([valor, etiqueta]) => (
                    <label
                      key={valor}
                      className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer rounded-lg border border-gray-100 px-2 py-1.5 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={(form.roles || []).includes(valor)}
                        onChange={() => alternarRol(valor)}
                        className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
                      />
                      {etiqueta}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Un usuario puede tener varios roles: los permisos del panel son
                  la unión de todos ellos. «Cliente» no se combina con roles de equipo.
                </p>
              </div>

              {editando && !esMiCuenta(editando) && (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setCampo('activo', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
                  />
                  Cuenta activa
                </label>
              )}

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
                  disabled={guardando || (form.roles || []).length === 0}
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
    </div>
  );
}
