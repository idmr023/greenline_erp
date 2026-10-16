import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Lock, ShieldCheck, SlidersHorizontal, Users, X } from '../../lib/icons';

/**
 * Árbol de herencia de roles (vista gráfica de AdminRoles).
 *
 * La jerarquía NO se inventa aquí: cada rol trae `hereda` / `excluir` / `todo`
 * / `propios` desde `GET /auth/roles` (metadatos del catálogo del backend,
 * fuente única). Este componente sólo construye el árbol padre→hijo y pinta,
 * por rol, cuántos permisos son propios, heredados, excluidos y efectivos.
 *
 * Sólo se muestra a quien tiene `menu:roles:read` (hoy ADMIN y
 * DESARROLLADOR_WEB); escribir la matriz lo decide `usuarios:manage-roles`.
 */

const NIVEL_COLOR = {
  SUPER: 'bg-amber-50 text-amber-700 border-amber-100',
  ALMACEN: 'bg-blue-50 text-blue-700 border-blue-100',
  TIENDA: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  CONTENIDO: 'bg-violet-50 text-violet-700 border-violet-100',
  CLIENTE_N: 'bg-gray-50 text-gray-600 border-gray-200',
};

/** Construye el bosque de herencia: cada rol cuelga de aquel del que `hereda`. */
function construirArbol(roles) {
  const porNombre = new Map(roles.map((r) => [r.nombre, { ...r, hijos: [] }]));
  const raices = [];
  const referenciasRotas = [];
  for (const nodo of porNombre.values()) {
    const padre = nodo.hereda ? porNombre.get(nodo.hereda) : null;
    if (padre && padre !== nodo) {
      padre.hijos.push(nodo);
    } else {
      raices.push(nodo);
      if (nodo.hereda && !padre) referenciasRotas.push({ rol: nodo.nombre, hereda: nodo.hereda });
    }
  }
  raices.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return { raices, referenciasRotas };
}

/** Desglose de permisos de un rol: propios, heredados y excluidos. */
function desgloseDe(rol) {
  const propios = rol.propios || [];
  const efectivos = rol.permisos || [];
  const excluidos = rol.excluir || [];
  const heredados = efectivos.filter((p) => !propios.includes(p));
  return { propios, efectivos, excluidos, heredados };
}

function Pill({ children, className = '' }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${className}`}>
      {children}
    </span>
  );
}

function Nodo({ nodo, seleccionado, onSeleccionar, colapsados, onToggle }) {
  const tieneHijos = nodo.hijos.length > 0;
  const colapsado = colapsados.has(nodo.nombre);
  const { efectivos, heredados, excluidos } = desgloseDe(nodo);
  const activo = seleccionado === nodo.nombre;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSeleccionar(nodo.nombre)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeleccionar(nodo.nombre); } }}
        className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
          activo ? 'border-brand bg-brand/5 ring-1 ring-brand/30' : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
        }`}
      >
        {tieneHijos ? (
          <button
            type="button"
            aria-label={colapsado ? 'Expandir' : 'Colapsar'}
            onClick={(e) => { e.stopPropagation(); onToggle(nodo.nombre); }}
            className="shrink-0 p-0.5 text-gray-400 hover:text-brand"
          >
            {colapsado ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <div className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{nodo.nombre}</p>
            {nodo.nivel && <Pill className={NIVEL_COLOR[nodo.nivel] || NIVEL_COLOR.CLIENTE_N}>{nodo.nivel}</Pill>}
            {nodo.nombre === 'ADMIN' && <Pill className="bg-amber-50 text-amber-700 border-amber-100">Protegido</Pill>}
            {nodo.todo && <Pill className="bg-rose-50 text-rose-700 border-rose-100">Todos</Pill>}
          </div>
          <p className="text-[11px] text-gray-500 truncate">
            {nodo.etiqueta || '—'} · {efectivos.length} permiso(s)
            {heredados.length > 0 && <span className="text-gray-400"> ({heredados.length} heredados)</span>}
            {excluidos.length > 0 && <span className="text-red-400"> · {excluidos.length} excluido(s)</span>}
          </p>
        </div>

        <span className="shrink-0 text-[10px] text-gray-400 hidden sm:block">
          {nodo.hereda ? `↳ ${nodo.hereda}` : 'raíz'}
        </span>
      </div>

      {tieneHijos && !colapsado && (
        <div className="ml-4 mt-2 space-y-2 border-l border-dashed border-gray-200 pl-4">
          {nodo.hijos.map((hijo) => (
            <Nodo
              key={hijo.nombre}
              nodo={hijo}
              seleccionado={seleccionado}
              onSeleccionar={onSeleccionar}
              colapsados={colapsados}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Detalle({ rol, grupos, puedeEscribir, onEditarPermisos, onCerrar }) {
  const { propios, efectivos, heredados, excluidos } = desgloseDe(rol);
  const setEfectivos = new Set(efectivos);
  const enEfectivos = (grupos || [])
    .map((g) => ({ grupo: g.grupo, claves: g.claves.filter((c) => setEfectivos.has(c)) }))
    .filter((g) => g.claves.length > 0);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900">{rol.nombre}</p>
          <p className="text-xs text-gray-500">{rol.etiqueta || '—'}</p>
        </div>
        <button type="button" onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {rol.nivel && <Pill className={NIVEL_COLOR[rol.nivel] || NIVEL_COLOR.CLIENTE_N}>{rol.nivel}</Pill>}
        {rol.panel && <Pill className="bg-brand/10 text-brand border-brand/20">Accede al panel</Pill>}
        {rol.aprobacion && <Pill className="bg-gray-50 text-gray-600 border-gray-200">Aprobación {rol.aprobacion}</Pill>}
        {rol.alcance && <Pill className="bg-gray-50 text-gray-600 border-gray-200">Alcance {rol.alcance}</Pill>}
      </div>

      <p className="text-[11px] text-gray-500 mt-3">
        {rol.hereda
          ? <>Hereda de <span className="font-semibold text-gray-700">{rol.hereda}</span> y suma sus permisos.</>
          : 'No hereda de nadie: es raíz de su rama.'}
      </p>

      <div className="grid grid-cols-2 gap-2 mt-3">
        {[
          ['Propios', propios.length, 'text-gray-900'],
          ['Heredados', heredados.length, 'text-brand'],
          ['Excluidos', excluidos.length, excluidos.length ? 'text-red-600' : 'text-gray-400'],
          ['Efectivos', efectivos.length, 'text-gray-900'],
        ].map(([label, n, color]) => (
          <div key={label} className="rounded-lg border border-gray-100 px-2.5 py-2">
            <p className={`text-lg font-bold ${color}`}>{n}</p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {excluidos.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-red-500 mb-1">Excluidos de la herencia</p>
          <div className="flex flex-wrap gap-1">
            {excluidos.map((c) => (
              <span key={c} className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">{c}</span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 max-h-72 overflow-auto pr-1 space-y-3">
        {enEfectivos.map((g) => (
          <div key={g.grupo}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">{g.grupo}</p>
            <div className="flex flex-wrap gap-1">
              {g.claves.map((c) => {
                const heredado = !propios.includes(c);
                return (
                  <span
                    key={c}
                    className={`text-[10px] rounded px-1.5 py-0.5 border ${
                      heredado ? 'text-brand bg-brand/5 border-brand/20' : 'text-gray-600 bg-gray-50 border-gray-200'
                    }`}
                    title={heredado ? 'Heredado' : 'Propio'}
                  >
                    {c}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {puedeEscribir && (
        <button
          type="button"
          onClick={() => onEditarPermisos(rol)}
          className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Editar permisos de {rol.nombre}
        </button>
      )}
    </div>
  );
}

export default function AdminRolesArbol({ roles = [], grupos = [], puedeEscribir = false, onEditarPermisos = () => {} }) {
  const { raices, referenciasRotas } = useMemo(() => construirArbol(roles), [roles]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [colapsados, setColapsados] = useState(() => new Set());

  const porNombre = useMemo(() => new Map(roles.map((r) => [r.nombre, r])), [roles]);
  const rolSeleccionado = seleccionado ? porNombre.get(seleccionado) : null;

  const onToggle = (nombre) =>
    setColapsados((s) => {
      const next = new Set(s);
      if (next.has(nombre)) next.delete(nombre);
      else next.add(nombre);
      return next;
    });

  return (
    <div>
      <div className="flex items-start gap-2 mb-3 text-[11px] text-gray-500">
        <Users className="w-4 h-4 text-brand shrink-0 mt-0.5" />
        <p>
          Cada nivel hereda los permisos del rol del que cuelga. Selecciona un rol para ver
          qué es propio, qué se hereda y qué se excluye de la herencia.
        </p>
      </div>

      {referenciasRotas.length > 0 && (
        <div className="mb-3 rounded-lg bg-amber-50 text-amber-800 text-xs px-3 py-2">
          {referenciasRotas.map((r) => (
            <div key={r.rol}>
              <Lock className="w-3 h-3 inline mr-1" />
              {r.rol} hereda de «{r.hereda}», que ya no existe: se muestra como raíz.
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          {raices.length === 0 ? (
            <p className="text-sm text-gray-500 py-8">No hay roles que mostrar.</p>
          ) : (
            raices.map((raiz) => (
              <Nodo
                key={raiz.nombre}
                nodo={raiz}
                seleccionado={seleccionado}
                onSeleccionar={setSeleccionado}
                colapsados={colapsados}
                onToggle={onToggle}
              />
            ))
          )}
        </div>

        {rolSeleccionado && (
          <Detalle
            rol={rolSeleccionado}
            grupos={grupos}
            puedeEscribir={puedeEscribir}
            onEditarPermisos={onEditarPermisos}
            onCerrar={() => setSeleccionado(null)}
          />
        )}
      </div>
    </div>
  );
}
