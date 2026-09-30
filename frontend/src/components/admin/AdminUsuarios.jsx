import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usuariosAPI } from '../../lib/api';
import {
  USUARIOS_ESCRITURA_ROLES,
  tieneRol,
} from '../../lib/roles';
import { Check, Loader2, Mail, Pencil, Plus, Search, ShieldCheck, Trash2, Users, X } from '../../lib/icons';

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

const FORM_VACIO = {
  nombre: '',
  apellido: '',
  email: '',
  telefono: '',
  rol: 'COLABORADOR_TIENDA',
  activo: true,
};

/** `request()` lanza `{ status, error }` con el JSON del backend. */
const mensajeDe = (err, porDefecto) => err?.error || err?.message || porDefecto;

export default function AdminUsuarios() {
  const { user, accessToken } = useAuth();
  const puedeEscribir = tieneRol(USUARIOS_ESCRITURA_ROLES, user?.rol);
  /** El correo es la credencial de acceso: sólo un ADMIN lo cambia (§RBAC). */
  const esAdmin = user?.rol === 'ADMIN';

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
      rol: u.rol || 'COLABORADOR_TIENDA',
      activo: u.activo !== false,
    });
    setFormAbierto(true);
    setMensaje(null);
  };

  const setCampo = (clave, valor) => setForm((f) => ({ ...f, [clave]: valor }));

  const guardar = async (e) => {
    e?.preventDefault?.();
    setGuardando(true);
    setMensaje(null);
    try {
      if (editando) {
        const nuevoEmail = form.email.trim();
        const res = await usuariosAPI.actualizar(
          editando.id,
          {
            nombre: form.nombre.trim(),
            apellido: form.apellido.trim(),
            telefono: form.telefono.trim() || null,
            rol: form.rol,
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
            rol: form.rol,
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

  const enviarCorreo = async (u) => {
    setAccionando(u.id);
    setMensaje(null);
    try {
      await usuariosAPI.enviarCorreoClave(u.email);
      setMensaje({
        tipo: 'ok',
        texto: `Correo enviado a ${u.email} (si la cuenta está activa).`,
      });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDe(err, 'No se pudo enviar el correo.') });
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
                      onClick={() => enviarCorreo(u)}
                      disabled={accionando === u.id}
                      className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Enviar correo para activar contraseña"
                    >
                      <Mail className="w-4 h-4" />
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
        («Acceso al panel»); aquí se decide el rol de cada cuenta.
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
                    Contraseña inicial *
                  </label>
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={form.password || ''}
                    onChange={(e) => setCampo('password', e.target.value)}
                    className="input"
                    placeholder="Mínimo 8 caracteres"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Si prefieres que cada quien la fije, créalo y usa el botón de correo.
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
                  Rol (permisos) *
                </label>
                <select
                  value={form.rol}
                  onChange={(e) => setCampo('rol', e.target.value)}
                  className="input"
                >
                  {ROLES_DISPONIBLES.map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>{etiqueta}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  El rol decide qué puede ver y hacer en el panel y en la bóveda.
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
    </div>
  );
}
