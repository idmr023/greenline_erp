import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { decisionesAPI } from '../../lib/api';
import { formatoDia } from '../../lib/decisiones';
import {
  AlertTriangle, ArrowRight, Cpu, Lightbulb, Loader2, Lock, MessageCircle, Search, Sparkles, TrendingUp, Zap,
} from '../../lib/icons';

// "Pregúntale a tus datos" (Sprint 5). Hoy responde con REGLAS sobre los
// agregados del dashboard (backend POST /api/decisiones/preguntar): sin IA,
// sin SQL armado desde el texto y sin datos personales. Cada respuesta
// muestra qué agregaría el modo con IA (docs/Sprint5/06).

const SEVERIDAD = {
  alta: { caja: 'border-red-200 bg-red-50', punto: 'bg-red-500', texto: 'Urgente' },
  media: { caja: 'border-amber-200 bg-amber-50', punto: 'bg-amber-500', texto: 'Revisar' },
  info: { caja: 'border-sky-100 bg-sky-50', punto: 'bg-sky-500', texto: 'Dato' },
};

const CAPACIDADES_IA = [
  { icon: MessageCircle, titulo: 'Preguntas libres y combinadas', texto: '"¿Qué carguero se vende más en Piura los sábados?" El modelo elige y combina las consultas seguras por su cuenta.' },
  { icon: Lightbulb, titulo: 'Explicaciones causales', texto: 'No solo qué cambió: por qué. Cruza campañas, precio, stock, zonas y caídas del sitio.' },
  { icon: TrendingUp, titulo: 'Pronóstico con estacionalidad', texto: 'Demanda por modelo y sede con efecto de día de semana, quincena y campañas, con intervalo de confianza.' },
  { icon: Zap, titulo: 'Alertas proactivas', texto: 'Vigila los indicadores en segundo plano y avisa por correo cuando algo se sale de lo normal.' },
  { icon: Sparkles, titulo: 'Informe ejecutivo semanal', texto: 'Resumen redactado para gerencia cada lunes, con los hallazgos y acciones sugeridas.' },
  { icon: Cpu, titulo: 'Simulador "¿qué pasa si...?"', texto: 'Precio, descuento o stock: estima el impacto en pedidos y margen antes de decidir.' },
  { icon: Search, titulo: 'Segmentación de clientes', texto: 'Grupos por recencia, frecuencia y monto (RFM) para campañas que sí convierten.' },
];

// **negrita** -> <strong>, sin HTML: React escapa el resto.
function TextoRico({ texto }) {
  return (
    <p className="text-sm leading-relaxed text-gray-800">
      {texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) => (
        parte.startsWith('**') && parte.endsWith('**')
          ? <strong key={i} className="font-semibold text-gray-950">{parte.slice(2, -2)}</strong>
          : <span key={i}>{parte}</span>
      ))}
    </p>
  );
}

function BloqueKpis({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((k) => (
        <div key={k.etiqueta} className={`rounded-lg border p-3 ${k.alerta ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{k.etiqueta}</p>
          <p className={`text-lg font-bold ${k.alerta ? 'text-red-700' : 'text-gray-900'}`}>{k.valor}</p>
          {k.detalle && <p className="text-[11px] text-gray-500">{k.detalle}</p>}
        </div>
      ))}
    </div>
  );
}

function BloqueBarras({ titulo, items }) {
  const maximo = Math.max(1, ...items.map((i) => i.valor));
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3">
      <p className="mb-2 text-xs font-semibold text-gray-600">{titulo}</p>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.etiqueta}>
            <div className="flex justify-between gap-2 text-xs">
              <span className="truncate text-gray-800">{i.etiqueta}</span>
              <span className="shrink-0 text-gray-500">{i.texto ?? i.valor}</span>
            </div>
            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-gradient-to-r from-brand to-emerald-400" style={{ width: `${Math.max(3, (i.valor / maximo) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BloqueSerie({ titulo, puntos, marcados = [] }) {
  if (!puntos.length) return null;
  const maximo = Math.max(1, ...puntos.map((p) => p.valor));
  const ancho = 100 / puntos.length;
  const marca = new Set(marcados);
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3">
      <p className="mb-2 text-xs font-semibold text-gray-600">{titulo}</p>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label={titulo}>
        {puntos.map((p, i) => {
          const alto = (p.valor / maximo) * 29;
          return (
            <rect
              key={p.dia}
              x={i * ancho + ancho * 0.15}
              y={30 - alto}
              width={ancho * 0.7}
              height={alto}
              className={marca.has(p.dia) ? 'fill-red-500' : 'fill-brand'}
            >
              <title>{`${formatoDia(p.dia)}: ${p.valor}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{formatoDia(puntos[0].dia)}</span>
        {marcados.length > 0 && <span className="text-red-500">rojo = día atípico</span>}
        <span>{formatoDia(puntos[puntos.length - 1].dia)}</span>
      </div>
    </div>
  );
}

function BloqueHallazgos({ items, onIrA }) {
  return (
    <ul className="space-y-2">
      {items.map((h) => {
        const s = SEVERIDAD[h.severidad] || SEVERIDAD.info;
        return (
          <li key={h.titulo} className={`flex items-start gap-3 rounded-lg border p-3 ${s.caja}`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.punto}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">{h.titulo}</p>
              {h.detalle && <p className="text-xs text-gray-600">{h.detalle}</p>}
            </div>
            <span className="sr-only">{s.texto}</span>
            {onIrA && h.pestana && (
              <button
                type="button"
                onClick={() => onIrA(h.pestana)}
                className="shrink-0 text-xs font-semibold text-brand hover:underline"
              >
                Ver detalle
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Bloque({ bloque, onIrA }) {
  if (bloque.tipo === 'kpis') return <BloqueKpis items={bloque.items} />;
  if (bloque.tipo === 'barras') return <BloqueBarras titulo={bloque.titulo} items={bloque.items} />;
  if (bloque.tipo === 'serie') return <BloqueSerie titulo={bloque.titulo} puntos={bloque.puntos} marcados={bloque.marcados} />;
  if (bloque.tipo === 'hallazgos') return <BloqueHallazgos items={bloque.items} onIrA={onIrA} />;
  if (bloque.tipo === 'lista') {
    return (
      <div className="rounded-lg border border-gray-100 bg-white p-3">
        <p className="mb-1 text-xs font-semibold text-gray-600">{bloque.titulo}</p>
        <ul className="list-inside list-disc text-xs text-gray-700">
          {bloque.items.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </div>
    );
  }
  return null;
}

function MensajeAsistente({ m, onIrA, onPreguntar }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-emerald-700 text-white">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-2xl rounded-tl-sm border border-gray-100 bg-gray-50 p-4">
          <TextoRico texto={m.texto} />
          {m.periodo && (
            <p className="mt-2 text-[11px] text-gray-400">
              {m.periodo.desde} a {m.periodo.hasta}{m.periodo.delTexto ? ' · periodo tomado de tu pregunta' : ''}
            </p>
          )}
        </div>
        {m.bloques?.map((b, i) => <Bloque key={i} bloque={b} onIrA={onIrA} />)}
        {m.conIA && (
          <p className="flex items-start gap-1.5 rounded-lg border border-dashed border-violet-200 bg-violet-50/60 px-3 py-2 text-[11px] text-violet-800">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            <span><strong>Con IA:</strong> {m.conIA}</span>
          </p>
        )}
        {m.sugerencias?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.sugerencias.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPreguntar(s)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:border-brand hover:text-brand"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDecisionesChat({ filtros, onIrA }) {
  const { accessToken } = useAuth();
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const fin = useRef(null);

  // Al abrir (o cambiar filtros): hallazgos automáticos como primer mensaje.
  useEffect(() => {
    let vigente = true;
    decisionesAPI.hallazgos(accessToken, filtros)
      .then((r) => vigente && setMensajes([{
        rol: 'asistente',
        texto: r.hallazgos.length
          ? `Revisé los datos de **${filtros.desde}** a **${filtros.hasta}**. Esto es lo primero que miraría:`
          : `Revisé los datos de **${filtros.desde}** a **${filtros.hasta}** y no encontré nada urgente. Pregúntame lo que quieras.`,
        bloques: r.hallazgos.length ? [{ tipo: 'hallazgos', items: r.hallazgos.slice(0, 6) }] : [],
        sugerencias: r.sugerencias.slice(0, 6),
      }]))
      .catch(() => vigente && setMensajes([{
        rol: 'asistente',
        texto: 'No pude cargar los hallazgos. Igual puedes preguntarme.',
        sugerencias: ['¿Cómo vamos?', '¿Cuáles son los modelos más pedidos?'],
      }]));
    return () => { vigente = false; };
  }, [accessToken, filtros]);

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensajes, pensando]);

  const preguntar = async (pregunta) => {
    const limpia = pregunta.trim();
    if (limpia.length < 2 || pensando) return;
    setTexto('');
    setMensajes((m) => [...m, { rol: 'usuario', texto: limpia }]);
    setPensando(true);
    try {
      const r = await decisionesAPI.preguntar(accessToken, limpia, filtros);
      setMensajes((m) => [...m, { rol: 'asistente', ...r }]);
    } catch (e) {
      setMensajes((m) => [...m, {
        rol: 'asistente',
        texto: e?.status === 403 ? 'Tu rol no tiene acceso a estos datos.' : (e?.error || 'No pude responder ahora. Intenta de nuevo.'),
      }]);
    } finally {
      setPensando(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
      <section className="flex min-h-[32rem] flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <header className="bg-gradient-to-r from-gray-950 via-gray-900 to-emerald-950 px-5 py-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="h-4 w-4 text-emerald-300" /> Pregúntale a tus datos
            </h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" /> IA desactivada · modo reglas
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-300">
            Responde con los mismos agregados del dashboard: sin datos personales y sin enviar nada a un modelo de IA.
          </p>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5" aria-live="polite">
          {mensajes.map((m, i) => (
            m.rol === 'usuario' ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand px-4 py-2 text-sm text-white">{m.texto}</p>
              </div>
            ) : (
              <MensajeAsistente key={i} m={m} onIrA={onIrA} onPreguntar={preguntar} />
            )
          ))}
          {pensando && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin text-brand" /> Analizando los datos...
            </div>
          )}
          <div ref={fin} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); preguntar(texto); }}
          className="flex gap-2 border-t border-gray-100 p-3"
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={300}
            placeholder='Ej. "¿cómo va el H5 este mes?"'
            aria-label="Pregunta sobre los datos"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
          />
          <button
            type="submit"
            disabled={pensando || texto.trim().length < 2}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Preguntar <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </section>

      <aside className="space-y-4">
        <div className="rounded-xl border border-violet-100 bg-gradient-to-b from-violet-50 to-white p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-violet-900">
            <Sparkles className="h-4 w-4" /> Lo que viene con IA
          </p>
          <p className="mt-1 text-[11px] text-violet-700">Planificado. Hoy el chat funciona con reglas.</p>
          <ul className="mt-3 space-y-3">
            {CAPACIDADES_IA.map(({ icon: Icon, titulo, texto: t }) => (
              <li key={titulo} className="flex gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                <div>
                  <p className="text-xs font-semibold text-gray-900">{titulo}</p>
                  <p className="text-[11px] leading-snug text-gray-600">{t}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="text-sm font-bold text-gray-900">Cómo responde</p>
          <ol className="mt-2 space-y-1.5 text-[11px] text-gray-600">
            <li><strong>1.</strong> Interpreta la pregunta (hoy con reglas; con IA, un modelo que elige herramientas).</li>
            <li><strong>2.</strong> Consulta solo agregados ya autorizados: nunca escribe SQL libre.</li>
            <li><strong>3.</strong> Analiza: tendencia, días atípicos, Pareto 80/20, proyección.</li>
            <li><strong>4.</strong> Responde con cifras y gráficos verificables en las otras pestañas.</li>
          </ol>
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-gray-50 p-2 text-[11px] text-gray-600">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            Aun con IA, el modelo solo vería totales: ni nombres, ni teléfonos, ni DNI.
          </p>
        </div>
      </aside>
    </div>
  );
}
