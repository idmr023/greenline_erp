import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock, Plus, Save, ShieldCheck } from '../../lib/icons';
import { useAuth } from '../../contexts/AuthContext';
import { bovedaAPI } from '../../lib/api';

const mensajeDe = (error, fallback) => error?.error || error?.message || fallback;
const mismasCategorias = (a, b) => [...a].sort().join('|') === [...b].sort().join('|');

function RolAccesoCard({ rol, categorias, guardando, onGuardar }) {
  const [seleccion, setSeleccion] = useState(rol.categorias || []);

  useEffect(() => {
    setSeleccion(rol.categorias || []);
  }, [rol.categorias]);

  const alternar = (clave) => {
    setSeleccion((actual) => (actual.includes(clave)
      ? actual.filter((item) => item !== clave)
      : [...actual, clave]));
  };
  const cambiado = !mismasCategorias(seleccion, rol.categorias || []);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{rol.etiqueta || rol.nombre}</h3>
          <p className="mt-0.5 text-[11px] text-gray-400">{rol.nombre}</p>
        </div>
        {rol.accesoTotal && (
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
            Acceso total
          </span>
        )}
      </div>

      {rol.accesoTotal ? (
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Ve todas las categorías por política de seguridad. Este acceso no se puede recortar.
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {categorias.map((categoria) => (
              <label key={categoria.clave} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={seleccion.includes(categoria.clave)}
                  onChange={() => alternar(categoria.clave)}
                  disabled={guardando}
                  className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                />
                <span>{categoria.nombre}</span>
                {!categoria.activa && <span className="text-[10px] text-gray-400">(inactiva)</span>}
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11px] text-gray-400">
              {seleccion.length === 0 ? 'No verá secretos de equipo.' : `${seleccion.length} categoría(s)`}
            </p>
            <button
              type="button"
              onClick={() => onGuardar(rol.nombre, seleccion)}
              disabled={!cambiado || guardando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function CategoriaCard({ categoria, guardando, onGuardar }) {
  const [nombre, setNombre] = useState(categoria.nombre);
  const [activa, setActiva] = useState(categoria.activa);

  useEffect(() => {
    setNombre(categoria.nombre);
    setActiva(categoria.activa);
  }, [categoria.nombre, categoria.activa]);

  const cambiado = nombre.trim() !== categoria.nombre || activa !== categoria.activa;

  return (
    <form
      className="rounded-xl border border-gray-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onGuardar(categoria.clave, { nombre: nombre.trim(), activa });
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <code className="text-xs font-semibold text-gray-500">{categoria.clave}</code>
        <span className="text-[11px] text-gray-400">{categoria.roles.length} rol(es) asignado(s)</span>
      </div>
      <label className="mt-3 block text-xs font-medium text-gray-600">
        Nombre visible
        <input
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
          maxLength={100}
          required
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </label>
      <div className="mt-3 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={activa}
            onChange={(event) => setActiva(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
          />
          Activa para nuevos secretos
        </label>
        <button
          type="submit"
          disabled={!cambiado || guardando || !nombre.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar
        </button>
      </div>
    </form>
  );
}

export default function AdminBovedaPermisos() {
  const { accessToken } = useAuth();
  const [datos, setDatos] = useState({ categorias: [], roles: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const [nueva, setNueva] = useState({ clave: '', nombre: '' });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const resultado = await bovedaAPI.permisos(accessToken);
      setDatos({
        categorias: resultado.categorias || [],
        roles: resultado.roles || [],
      });
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo cargar la configuración de la Bóveda.'));
    } finally {
      setCargando(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ejecutar = async (identificador, operacion, textoExito) => {
    setGuardando(identificador);
    setMensaje(null);
    try {
      await operacion();
      await cargar();
      setMensaje({ tipo: 'ok', texto: textoExito });
      return true;
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDe(err, 'No se pudieron guardar los cambios.') });
      return false;
    } finally {
      setGuardando(null);
    }
  };

  const crearCategoria = async (event) => {
    event.preventDefault();
    const creada = await ejecutar(
      'nueva-categoria',
      () => bovedaAPI.crearCategoria({
        clave: nueva.clave.trim(),
        nombre: nueva.nombre.trim(),
      }, accessToken),
      'Categoría creada. Asígnala a los roles que deban verla.',
    );
    if (creada) setNueva({ clave: '', nombre: '' });
  };

  return (
    <div className="max-w-6xl p-6">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <Lock className="h-5 w-5 text-brand" />
          Accesos de la Bóveda
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-500">
          Define qué categorías de contraseñas puede ver cada rol. Los cambios se aplican
          sobre metadatos de acceso: esta pantalla nunca lee ni muestra secretos.
        </p>
      </div>

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
        <div>
          <p className="font-semibold">Reglas de acceso</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-relaxed">
            <li>ADMIN y DESARROLLADOR_WEB conservan siempre acceso total.</li>
            <li>Quitar una categoría a un rol oculta los secretos de esa categoría en la bóveda de equipo.</li>
            <li>Desactivar una categoría no revoca accesos: para ello, desmárcala en cada rol y guarda.</li>
          </ul>
        </div>
      </div>

      {mensaje && (
        <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {mensaje.texto}
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => void cargar()} className="font-semibold underline">Reintentar</button>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando accesos…
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-base font-bold text-gray-900">Categorías visibles por rol</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {datos.roles.map((rol) => (
                <RolAccesoCard
                  key={rol.nombre}
                  rol={rol}
                  categorias={datos.categorias}
                  guardando={guardando === `rol:${rol.nombre}`}
                  onGuardar={(nombre, categorias) => ejecutar(
                    `rol:${nombre}`,
                    () => bovedaAPI.setCategoriasDeRol(nombre, categorias, accessToken),
                    `Accesos de ${rol.etiqueta || nombre} actualizados.`,
                  )}
                />
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-base font-bold text-gray-900">Catálogo de categorías</h2>
            <p className="mt-1 text-xs text-gray-500">
              Las categorías nuevas nacen sin acceso para ningún rol. No se eliminan para evitar dejar secretos sin clasificar.
            </p>

            <form onSubmit={crearCategoria} className="mt-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]">
              <label className="text-xs font-medium text-gray-600">
                Clave interna
                <input
                  value={nueva.clave}
                  onChange={(event) => setNueva({ ...nueva, clave: event.target.value })}
                  placeholder="ej. proveedores"
                  pattern="[a-z0-9]+(?:_[a-z0-9]+)*"
                  maxLength={64}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </label>
              <label className="text-xs font-medium text-gray-600">
                Nombre visible
                <input
                  value={nueva.nombre}
                  onChange={(event) => setNueva({ ...nueva, nombre: event.target.value })}
                  placeholder="Proveedores"
                  maxLength={100}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </label>
              <button
                type="submit"
                disabled={guardando === 'nueva-categoria' || !nueva.clave.trim() || !nueva.nombre.trim()}
                className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                {guardando === 'nueva-categoria' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Añadir
              </button>
            </form>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {datos.categorias.map((categoria) => (
                <CategoriaCard
                  key={categoria.clave}
                  categoria={categoria}
                  guardando={guardando === `categoria:${categoria.clave}`}
                  onGuardar={(clave, cambios) => ejecutar(
                    `categoria:${clave}`,
                    () => bovedaAPI.actualizarCategoria(clave, cambios, accessToken),
                    `Categoría ${categoria.nombre} actualizada.`,
                  )}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
