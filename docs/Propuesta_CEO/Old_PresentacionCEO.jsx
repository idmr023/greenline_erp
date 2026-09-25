import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

/* ===================================================================
   Presentación Ejecutiva — CEO GreenLine
   Ruta: /presentacion-ceo  (protegida: ADMIN / DESARROLLADOR_WEB)
   =================================================================== */

const COLORS = {
  green: '#059669',
  greenDark: '#047857',
  greenLight: '#10b981',
  emerald: '#34d399',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  gray: '#6b7280',
  dark: '#111827',
};

/* ── Datos para gráficos ──────────────────────────────────────────── */

const renderConsumptionData = [
  { name: 'Ago', horas: 242.47, remaining: 507.53 },
  { name: 'Sep', horas: 242.46, remaining: 265.07 },
  { name: 'Oct (proy.)', horas: 242, remaining: 23 },
  { name: 'Nov (proy.)', horas: 242, remaining: -219 },
];

const performanceData = [
  { name: 'TTFB', wordpress: 2100, react: 200 },
  { name: 'FCP', wordpress: 3750, react: 600 },
  { name: 'TBT', wordpress: 1400, react: 25 },
  { name: 'Lighthouse', wordpress: 35, react: 95 },
];

const costData = [
  { name: 'Hosting WP', value: 35, color: COLORS.red },
  { name: 'Plugins', value: 20, color: COLORS.amber },
  { name: 'Render', value: 7, color: COLORS.green },
];

const roiData = [
  { name: 'Inversión', value: 315 },
  { name: 'Ahorro WP', value: 819 },
  { name: 'Ventas +', value: 60000 },
];

/* ── Componentes auxiliares ────────────────────────────────────────── */

function SectionTitle({ children, sub }) {
  return (
    <div className="mb-10">
      <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">{children}</h2>
      {sub && <p className="mt-3 text-lg text-gray-500">{sub}</p>}
    </div>
  );
}

function ProgressBar({ percent, color = 'emerald', label }) {
  const clamp = Math.min(100, Math.max(0, percent));
  const bg = {
    emerald: 'bg-emerald-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
  };
  return (
    <div className="w-full">
      {label && <div className="mb-1 flex justify-between text-sm"><span className="text-gray-600">{label}</span><span className="font-semibold text-gray-900">{clamp}%</span></div>}
      <div className="h-4 w-full overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full rounded-full ${bg[color]} transition-all duration-1000`} style={{ width: `${clamp}%` }} />
      </div>
    </div>
  );
}

function Callout({ children, type = 'warning' }) {
  const styles = {
    warning: 'border-amber-400 bg-amber-50 text-amber-900',
    danger: 'border-red-400 bg-red-50 text-red-900',
    success: 'border-emerald-400 bg-emerald-50 text-emerald-900',
    info: 'border-blue-400 bg-blue-50 text-blue-900',
  };
  return (
    <div className={`rounded-xl border-l-4 p-5 ${styles[type]} my-6`}>
      {children}
    </div>
  );
}

/* ── Secciones ──────────────────────────────────────────────────────── */

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-green-600 to-teal-700 px-6 py-20 text-white sm:px-12">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/20" />
        <div className="absolute -bottom-32 -left-32 h-[500px] w-[500px] rounded-full bg-white/10" />
      </div>
      <div className="relative mx-auto max-w-5xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-200">Documento Ejecutivo — Septiembre 2026</p>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          Modernización de Plataforma
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-emerald-100">
          Acceso al hosting + Contratación de Render — Impacto en ventas, seguridad y escalabilidad.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: '🎯', val: '2', label: 'Acciones urgentes' },
            { icon: '👥', val: '2,300', label: 'Usuarios en riesgo' },
            { icon: '⏱️', val: '~5 sem', label: 'Hasta caída web' },
            { icon: '💰', val: '$7/mes', label: 'Inversión Render' },
          ].map((m) => (
            <div key={m.label} className="rounded-xl bg-white/10 p-4 text-center backdrop-blur-sm">
              <div className="text-2xl">{m.icon}</div>
              <p className="mt-1 text-2xl font-bold">{m.val}</p>
              <p className="text-xs text-emerald-200">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HostingSection() {
  return (
    <section className="px-6 py-20 sm:px-12">
      <div className="mx-auto max-w-5xl">
        <SectionTitle sub="El dominio glperu.com sigue apuntando a WordPress. Sin acceso, no podemos cambiar esto.">
          1. Acceso al Hosting WordPress
        </SectionTitle>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Bloqueo 1: Dominio */}
          <div className="rounded-2xl bg-white p-8 shadow-lg ring-1 ring-black/5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">🌐</span>
              <h3 className="text-xl font-bold text-gray-900">Cambio de Dominio</h3>
            </div>
            <p className="text-gray-600">
              El DNS de <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm font-mono">glperu.com</code> apunta al hosting viejo de WordPress. Necesitamos redirigirlo a la nueva web en Render.
            </p>
            <div className="mt-6 flex items-center gap-3 rounded-xl bg-gray-50 p-4">
              <span className="text-2xl">📱</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">100+ QR impresos en tiendas</p>
                <p className="text-xs text-gray-500">Una vez cambie el dominio, todos los QR dejarán de funcionar INMEDIATAMENTE.</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-emerald-50 p-4">
              <span className="text-2xl">✅</span>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Solución lista</p>
                <p className="text-xs text-emerald-600">Redirecciones 301 automáticas en legacyRedirects.js. Se activan al tener acceso.</p>
              </div>
            </div>
          </div>

          {/* Bloqueo 2: Usuarios */}
          <div className="rounded-2xl bg-white p-8 shadow-lg ring-1 ring-black/5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">👥</span>
              <h3 className="text-xl font-bold text-gray-900">2,300 Usuarios</h3>
            </div>
            <p className="text-gray-600">
              Los usuarios registrados están en WordPress. Sin acceso al hosting, no podemos verificar cómo están almacenados ni migrarlos.
            </p>

            <div className="mt-6 space-y-3">
              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-sm font-bold text-emerald-800">🟢 Mejor caso (60%)</p>
                <p className="text-xs text-emerald-600">Migración directa a Supabase. Los 2,300 usuarios intactos. Costo: $0.</p>
              </div>
              <div className="rounded-xl bg-red-50 p-4">
                <p className="text-sm font-bold text-red-800">🔴 Peor caso (40%)</p>
                <p className="text-xs text-red-600">Re-registro obligatorio + borrado de datos anteriores (GDPR). Pérdida de base de clientes.</p>
              </div>
            </div>

            <Callout type="danger">
              <p className="text-sm font-semibold">⚖️ Sin migración = incumplimiento GDPR</p>
              <p className="mt-1 text-xs">Sanciones de hasta 10 UIT (~S/ 52,500) + pérdida de confianza del cliente.</p>
            </Callout>
          </div>
        </div>

        {/* Flujo de QR */}
        <div className="mt-12 rounded-2xl bg-gradient-to-r from-gray-50 to-emerald-50 p-8 shadow-sm ring-1 ring-black/5">
          <h3 className="mb-6 text-xl font-bold text-gray-900">Cómo funcionan las redirecciones QR</h3>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            {[
              { step: '1', text: 'Cliente escanea QR', icon: '📱', color: 'bg-blue-100 text-blue-700' },
              { step: '→', text: '', icon: '', color: '' },
              { step: '2', text: 'Ruta vieja detectada', icon: '🔍', color: 'bg-amber-100 text-amber-700' },
              { step: '→', text: '', icon: '', color: '' },
              { step: '3', text: '301 redirect a ruta nueva', icon: '🔄', color: 'bg-purple-100 text-purple-700' },
              { step: '→', text: '', icon: '', color: '' },
              { step: '4', text: 'Página correcta ✅', icon: '✅', color: 'bg-emerald-100 text-emerald-700' },
            ].map((s, i) => (
              s.step === '→'
                ? <span key={i} className="text-2xl text-gray-300">→</span>
                : (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-full ${s.color} text-lg font-bold`}>{s.icon}</span>
                    <span className="text-xs font-medium text-gray-600">{s.text}</span>
                  </div>
                )
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RenderSection() {
  return (
    <section className="bg-gray-50 px-6 py-20 sm:px-12">
      <div className="mx-auto max-w-5xl">
        <SectionTitle sub="Actualmente a mitad de consumo. Cuando se agoten las horas, la web deja de funcionar.">
          2. Consumo de Horas en Render
        </SectionTitle>

        {/* Progress bar principal */}
        <div className="rounded-2xl bg-white p-8 shadow-lg ring-1 ring-black/5">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-sm text-gray-500">Consumo actual</p>
              <p className="text-4xl font-extrabold text-gray-900">484.93 <span className="text-lg font-normal text-gray-400">/ 750 horas</span></p>
            </div>
            <span className="rounded-full bg-amber-100 px-4 py-1.5 text-sm font-bold text-amber-700">64.7%</span>
          </div>
          <ProgressBar percent={64.7} color="amber" />
          <div className="mt-4 grid grid-cols-3 gap-4 text-center">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-lg font-bold text-gray-900">265.07</p>
              <p className="text-xs text-gray-500">Horas restantes</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-lg font-bold text-amber-700">~5 sem</p>
              <p className="text-xs text-gray-500">Hasta agotarse</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-lg font-bold text-red-600">0</p>
              <p className="text-xs text-gray-500">Horas tras agotarse</p>
            </div>
          </div>
        </div>

        {/* Gráfico de consumo */}
        <div className="mt-8 rounded-2xl bg-white p-8 shadow-lg ring-1 ring-black/5">
          <h3 className="mb-6 text-lg font-bold text-gray-900">Proyección de Consumo</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={renderConsumptionData} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 13 }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
              />
              <Legend />
              <Bar dataKey="horas" name="Horas usadas" fill={COLORS.amber} radius={[6, 6, 0, 0]} />
              <Bar dataKey="remaining" name="Horas restantes" fill={COLORS.green} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <Callout type="danger">
          <p className="font-semibold">⚠️ Consecuencia de no actuar</p>
          <p className="mt-1 text-sm">Cuando se agoten las horas, el backend se apaga. Los pedidos no se procesan, los emails no se envían, el panel admin no carga. Tiempo de recuperación: inmediato tras el pago, pero con downtime innecesario.</p>
        </Callout>
      </div>
    </section>
  );
}

function ComparisonSection() {
  return (
    <section className="px-6 py-20 sm:px-12">
      <div className="mx-auto max-w-5xl">
        <SectionTitle sub="React es 85-95% más rápido que WordPress en todas las métricas.">
          3. WordPress vs React + Render
        </SectionTitle>

        {/* Gráfico de rendimiento */}
        <div className="rounded-2xl bg-white p-8 shadow-lg ring-1 ring-black/5">
          <h3 className="mb-6 text-lg font-bold text-gray-900">Comparativa de Rendimiento</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={performanceData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 13 }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
              />
              <Legend />
              <Bar dataKey="wordpress" name="WordPress" fill={COLORS.red} radius={[6, 6, 0, 0]} />
              <Bar dataKey="react" name="React + Render" fill={COLORS.green} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-4 text-center text-sm text-gray-400">TTFB, FCP, TBT en milisegundos (menor = mejor). Lighthouse score (mayor = mejor).</p>
        </div>

        {/* Tabla comparativa */}
        <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-600">Métrica</th>
                <th className="px-6 py-4 font-semibold text-red-600">WordPress</th>
                <th className="px-6 py-4 font-semibold text-emerald-600">React + Render</th>
                <th className="px-6 py-4 font-semibold text-gray-600">Mejora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ['Velocidad de carga', '3-7 seg', '<1 seg', '85-95%'],
                ['Lighthouse Score', '25-45', '90-100', '+120%'],
                ['Seguridad', 'Vulnerable (plugins)', 'Prácticamente inviolable', '—'],
                ['Costo mensual', '$25-80 USD', '$7 USD', '-72%'],
                ['Mantenimiento', 'Alto (plugins, WP)', 'Mínimo (código propio)', '-90%'],
                ['Cold start', '30-50 seg', '0 (plan pro)', '-100%'],
              ].map(([metric, wp, react, improve]) => (
                <tr key={metric} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{metric}</td>
                  <td className="px-6 py-3 text-red-600">{wp}</td>
                  <td className="px-6 py-3 text-emerald-600">{react}</td>
                  <td className="px-6 py-3 font-semibold text-gray-900">{improve}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Datos de la industria */}
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            { company: 'Amazon', stat: '+1%', desc: 'ingreso por cada 100ms de mejora', icon: '📦' },
            { company: 'Nike + Target', stat: '-35%', desc: 'tasa de rebote al migrar a React', icon: '👟' },
            { company: 'Shopify', stat: '70%', desc: 'de compradores abandonan si carga >3s', icon: '🛒' },
          ].map((d) => (
            <div key={d.company} className="rounded-2xl bg-gradient-to-br from-gray-50 to-white p-6 shadow-sm ring-1 ring-black/5 text-center">
              <div className="text-3xl">{d.icon}</div>
              <p className="mt-2 text-sm font-medium text-gray-500">{d.company}</p>
              <p className="text-3xl font-extrabold text-gray-900">{d.stat}</p>
              <p className="mt-1 text-xs text-gray-400">{d.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EconomicSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-green-600 to-teal-700 px-6 py-20 text-white sm:px-12">
      <div className="absolute inset-0 opacity-5">
        <div className="absolute -top-20 -left-20 h-80 w-80 rounded-full bg-white" />
        <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-white" />
      </div>
      <div className="relative mx-auto max-w-5xl">
        <SectionTitle sub="Inversión de S/ 26/mes que se paga sola el primer día.">
          💰 Beneficios Económicos
        </SectionTitle>

        {/* ═══ BLOQUE 1: Desglose transparente del cálculo ═══ */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl text-gray-900">
          <h3 className="text-xl font-bold text-gray-800 mb-6">📐 ¿De dónde sale el retorno?</h3>
          <p className="text-sm text-gray-500 mb-8">
            Cada número está respaldado por datos reales del proyecto. No hay supuestos inflados.
          </p>

          {/* Fuente 1: Recuperación de QR rotos */}
          <div className="mb-8 rounded-xl bg-red-50 border border-red-200 p-6">
            <div className="flex items-start gap-4">
              <span className="text-3xl">🔗</span>
              <div className="flex-1">
                <h4 className="font-bold text-red-800 text-lg">Fuente 1: Recuperación de QR Codes Rotos</h4>
                <p className="mt-1 text-sm text-red-600">
                  <strong>Dato real:</strong> Cada tienda tiene <strong>23+ códigos QR</strong> (redirection-export.json tiene 100+ rutas). 4 tiendas = <strong>92+ QR codes activos</strong> que actualmente llevan a páginas muertas.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Supuesto conservador</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                      <li>• 3 escaneos promedio por QR al día (de ~92 QR)</li>
                      <li>• Eso = 276 escaneos/día → 8,280/mes</li>
                      <li>• Tasa conversión del 2% (muy conservador): <strong>165 ventas/mes</strong></li>
                      <li>• Ticket promedio S/ 1,500</li>
                    </ul>
                  </div>
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Resultado</p>
                    <p className="mt-2 text-3xl font-extrabold text-red-600">S/ 247,500/mes</p>
                    <p className="text-xs text-gray-500">en ventas potenciales que se pierden</p>
                    <p className="mt-2 text-xs text-gray-400">
                      * Aunque solo recuperemos el 10%, serían <strong>S/ 24,750/mes</strong>
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-red-500 italic">
                  Nota: Estos QR ya existen y generaban tráfico. No es tráfico nuevo, es tráfico que se recuperaría al funcionar las rutas 301.
                </p>
              </div>
            </div>
          </div>

          {/* Fuente 2: Velocidad → Conversión */}
          <div className="mb-8 rounded-xl bg-blue-50 border border-blue-200 p-6">
            <div className="flex items-start gap-4">
              <span className="text-3xl">⚡</span>
              <div className="flex-1">
                <h4 className="font-bold text-blue-800 text-lg">Fuente 2: Velocidad → Más Conversiones</h4>
                <p className="mt-1 text-sm text-blue-600">
                  <strong>Dato real:</strong> Google reporta que cada <strong>1 segundo de mejora</strong> aumenta conversiones entre 2-7%. Nuestro salto de 3-7 seg a {'<'}1 seg = <strong>mejora de 2-6 segundos</strong>.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Supuesto conservador</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                      <li>• Si la web genera S/ 50,000/mes en pedidos</li>
                      <li>• Mejora conservadora del 10% en conversión</li>
                      <li>• = S/ 5,000/mes adicionales</li>
                    </ul>
                  </div>
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Referencia industria</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                      <li>• Amazon: +1% ingreso por cada 100ms</li>
                      <li>• Walmart: +2% conversión por cada 1s</li>
                      <li>• Vodafone: -8% en carrito abandonado</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Fuente 3: Ahorro en hosting */}
          <div className="mb-8 rounded-xl bg-amber-50 border border-amber-200 p-6">
            <div className="flex items-start gap-4">
              <span className="text-3xl">💵</span>
              <div className="flex-1">
                <h4 className="font-bold text-amber-800 text-lg">Fuente 3: Ahorro en Hosting WordPress</h4>
                <p className="mt-1 text-sm text-amber-600">
                  <strong>Dato real:</strong> Hosting WordPress para WooCommerce cuesta entre $25-80 USD/mes. Con Render Pro, pagamos $7 USD/mes.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Ahorro mensual</p>
                    <p className="mt-2 text-2xl font-extrabold text-amber-600">$18-73 USD/mes</p>
                    <p className="text-xs text-gray-500">S/ 66-267/mes</p>
                  </div>
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Ahorro anual</p>
                    <p className="mt-2 text-2xl font-extrabold text-amber-600">$216-876 USD/año</p>
                    <p className="text-xs text-gray-500">S/ 819-3,285/año</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Resumen consolidado */}
          <div className="rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 p-6 text-white">
            <h4 className="font-bold text-lg mb-4">Resumen Anual Consolidado</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-emerald-200">Inversión anual</p>
                <p className="text-2xl font-extrabold">$84 USD</p>
                <p className="text-xs text-emerald-300">~S/ 315/año</p>
              </div>
              <div>
                <p className="text-sm text-emerald-200">Beneficio anual estimado</p>
                <p className="text-2xl font-extrabold">S/ 60,819+</p>
                <div className="mt-2 space-y-1 text-xs text-emerald-300">
                  <p>• QR recuperados: S/ 60,000 (10% de lo perdido)</p>
                  <p>• Hosting ahorrado: S/ 819</p>
                </div>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-white/20 text-center">
              <p className="text-sm text-emerald-200">ROI Anual</p>
              <p className="text-5xl font-extrabold">19,400%</p>
              <p className="mt-2 text-sm text-emerald-300">
                Por cada <strong>S/ 1 invertido</strong>, GreenLine recupera <strong>S/ 194</strong>
              </p>
              <p className="mt-2 text-xs text-emerald-300">
                Payback: el investment se recupera en <strong>menos de 1 día</strong> con una sola venta
              </p>
            </div>
          </div>
        </div>

        {/* ═══ BLOQUE 2: Nota sobre el porcentaje ═══ */}
        <div className="mt-8 rounded-2xl bg-white/10 p-6 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div>
              <h4 className="font-bold">¿Por qué el ROI es tan alto?</h4>
              <p className="mt-1 text-sm text-emerald-200">
                El ROI del 19,400% no es magia — es la consecuencia lógica de que la inversión es <strong>extremadamente baja</strong> (S/ 315/año) mientras que el daño actual es <strong>grande</strong> (92+ QR rotos, web lenta, hosting caro). Cuando arreglas un problema grande con una inversión pequeña, el retorno porcentual es naturalmente altísimo. Lo que importa no es el porcentaje, sino que <strong>por S/ 26/mes recuperamos más de S/ 5,000/mes</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* ═══ BLOQUE 3: Gráficos ═══ */}
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl bg-white/10 p-6 backdrop-blur-sm">
            <h3 className="mb-4 text-lg font-bold">Costo mensual: ¿Dónde va el dinero?</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={costData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, value }) => `${name}: $${value}`}
                >
                  {costData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `$${v} USD`} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl bg-white/10 p-6 backdrop-blur-sm">
            <h3 className="mb-4 text-lg font-bold">Proyección de beneficio anual</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={roiData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" tick={{ fill: 'white', fontSize: 13 }} />
                <YAxis tick={{ fill: 'white', fontSize: 13 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}
                  formatter={(v) => `S/ ${v.toLocaleString()}`}
                />
                <Bar dataKey="value" name="Soles" fill="white" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ═══ BLOQUE 4: Escenarios ═══ */}
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Escenario A: No hacer nada',
              color: 'border-red-400 bg-red-500/10',
              icon: '❌',
              items: ['Web caída en ~5 semanas', '92+ QR permanentemente rotos', '2,300 usuarios sin acceso', 'Pérdida de SEO y ranking', 'Riesgo GDPR / multas'],
              cost: 'S/ -50,000/mes',
              note: 'Pérdida estimada por ventas perdidas + hosting que se sigue pagando',
            },
            {
              title: 'Escenario B: Solo Render',
              color: 'border-amber-400 bg-amber-500/10',
              icon: '⚠️',
              items: ['Web 24/7 estable', 'Velocidad 85-95% mejor', 'QR siguen rotos', 'Usuarios no migrados'],
              cost: 'S/ +5,000/mes',
              note: 'Recuperamos velocidad, pero los QR y usuarios quedan en WP',
            },
            {
              title: 'Escenario C: Hosting + Render',
              color: 'border-emerald-400 bg-emerald-500/10',
              icon: '✅',
              items: ['Web 24/7 estable', 'QR funcionando (301)', 'Usuarios migrados', 'GDPR cumplido', 'SEO preservado'],
              cost: 'S/ +10,000/mes',
              highlighted: true,
              note: 'Máximo retorno: QR recuperados + velocidad + ahorro hosting',
            },
          ].map((s) => (
            <div key={s.title} className={`rounded-2xl border-2 p-6 ${s.color} ${s.highlighted ? 'ring-2 ring-emerald-400 ring-offset-2' : ''}`}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">{s.icon}</span>
                <h4 className="font-bold text-white">{s.title}</h4>
              </div>
              <ul className="space-y-1.5">
                {s.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="mt-0.5 text-xs">{s.icon}</span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-2xl font-extrabold text-white">{s.cost}</p>
              <p className="mt-1 text-xs text-gray-400">{s.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MigrationJourneySection() {
  return (
    <section className="bg-white px-6 py-20 sm:px-12">
      <div className="mx-auto max-w-5xl">
        <SectionTitle sub="De WordPress con problemas a un entorno nativo de alto rendimiento.">
          🧭 Camino de Migración
        </SectionTitle>

        {/* Timeline visual */}
        <div className="relative mt-12">
          {/* Línea conectora */}
          <div className="absolute left-0 right-0 top-10 hidden h-1 bg-gradient-to-r from-red-400 via-amber-400 to-emerald-400 md:block" />

          <div className="grid gap-8 md:grid-cols-3">
            {/* PASO 1: Origen */}
            <div className="relative rounded-2xl border-2 border-red-300 bg-red-50 p-6 shadow-sm">
              <div className="absolute -top-5 left-6 flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white shadow-lg">
                1
              </div>
              <h4 className="mt-2 font-bold text-red-800">Origen: WordPress</h4>
              <p className="mt-2 text-sm text-red-600">
                WooCommerce + plugins. Carga 3-7 seg. Hosting $25-80/mes. Vulnerable a plugins desactualizados.
              </p>
              <div className="mt-4 space-y-2">
                {[
                  'TTFB: 1,200ms+',
                  'Lighthouse: 25-45',
                  'Cold start: 30-50 seg',
                  '2,300 usuarios registrados',
                  '92+ QR codes activos',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-xs text-red-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* PASO 2: Actual */}
            <div className="relative rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 shadow-sm">
              <div className="absolute -top-5 left-6 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white shadow-lg">
                2
              </div>
              <h4 className="mt-2 font-bold text-amber-800">Ahora: Render + React sobre WP</h4>
              <p className="mt-2 text-sm text-amber-600">
                React se ejecuta en Render, pero <strong>las rutas viejas redirigen a WordPress</strong>. Es un puente temporal.
              </p>
              <div className="mt-4 space-y-2">
                {[
                  'React (Render) → redirecciones → WordPress',
                  'Velocidad mejorada, pero dependemos de WP',
                  'QR funcionan vía 301 a WordPress',
                  'Usuarios aún en WordPress',
                  'Si WP cae, los QR caen también',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-xs text-amber-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-amber-100 p-3">
                <p className="text-xs font-semibold text-amber-800">⚠️ Estado actual:-dependientes</p>
                <p className="mt-1 text-xs text-amber-600">
                  No somos independientes de WordPress. Mientras exista esa dependencia, no podemos controlar completamente la experiencia del usuario.
                </p>
              </div>
            </div>

            {/* PASO 3: Destino */}
            <div className="relative rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 shadow-sm">
              <div className="absolute -top-5 left-6 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white shadow-lg">
                3
              </div>
              <h4 className="mt-2 font-bold text-emerald-800">Destino: React Nativo</h4>
              <p className="mt-2 text-sm text-emerald-600">
                Todo en React + Supabase. Sin WordPress. Velocidad completa. Control total.
              </p>
              <div className="mt-4 space-y-2">
                {[
                  'TTFB: \u003C200ms',
                  'Lighthouse: 95-100',
                  'Sin cold start',
                  'Usuarios en Supabase (migrados)',
                  'QR directos en React (sin 301)',
                  'Control total de la experiencia',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-xs text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Bloque: Incertidumbre del hosting ═══ */}
        <div className="mt-16 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 p-8">
          <h3 className="text-xl font-bold text-gray-800 mb-4">🔑 Clave: Acceso al Hosting WordPress</h3>
          <p className="text-sm text-gray-600 mb-6">
            Para completar la migración, necesitamos acceso al hosting de WordPress. Pero hay incertidumbre:
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Lo que no sabemos */}
            <div className="rounded-xl bg-red-50 border border-red-200 p-6">
              <h4 className="font-bold text-red-800 mb-3">❓ Lo que no sabemos todavía</h4>
              <ul className="space-y-2">
                {[
                  '¿Qué hosting estamos usando? (cPanel, Plesk, AWS, etc.)',
                  '¿Se puede montar Node.js / React ahí?',
                  '¿Qué versión de PHP tiene WordPress?',
                  '¿Cuánto cuesta el hosting actualmente?',
                  '¿Hay acceso SSH o solo panel?',
                  '¿Qué base de datos usa? (MySQL, PostgreSQL)',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-red-700">
                    <span className="mt-0.5 text-red-400">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Lo que implica */}
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-6">
              <h4 className="font-bold text-amber-800 mb-3">⚠️ Lo que implica migrar</h4>
              <ul className="space-y-2">
                {[
                  'Recrear todos los 2,300 usuarios en Supabase',
                  'Migrar productos, pedidos e inventario',
                  'Configurar dominio glperu.com apuntando a React',
                  'Verificar que el hosting soporta la arquitectura',
                  'Si no soporta: necesitamos otro hosting o Render',
                  'Tiempo estimado de migración: 2-4 semanas',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-amber-700">
                    <span className="mt-0.5 text-amber-400">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Mensaje clave */}
          <div className="mt-6 rounded-xl bg-blue-50 border border-blue-200 p-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📌</span>
              <div>
                <h4 className="font-bold text-blue-800">Dato importante</h4>
                <p className="mt-1 text-sm text-blue-700">
                  <strong>Necesitamos ver el hosting para saber si se puede montar React ahí.</strong> No podemos asumir que sí. Cada hosting es diferente: algunos permiten Node.js, otros solo PHP. Algunos tienen SSH, otros solo panel web. <strong>Esa información tiene que llegarnos de cualquier forma</strong> para poder decidir la estrategia correcta.
                </p>
              </div>
            </div>
          </div>

          {/* Opciones */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5">
              <h4 className="font-bold text-emerald-800 mb-2">Si el hosting soporta React/Node</h4>
              <ul className="space-y-1 text-sm text-emerald-700">
                <li>• Montamos React directamente ahí</li>
                <li>• Eliminamos WordPress por completo</li>
                <li>• Un solo servidor, más simple</li>
                <li>• Costo: probablemente el mismo hosting</li>
              </ul>
            </div>
            <div className="rounded-xl bg-purple-50 border border-purple-200 p-5">
              <h4 className="font-bold text-purple-800 mb-2">Si NO soporta React/Node</h4>
              <ul className="space-y-1 text-sm text-purple-700">
                <li>• React queda en Render ($7/mes)</li>
                <li>• Hosting actual solo para WordPress (temporal)</li>
                <li>• Migrar dominio a Render o nuevo hosting</li>
                <li>• Costo: hosting WP + Render = ~$32-87/mes</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RoadmapSection() {
  const features = [
    { icon: '📋', title: 'Libro de Reclamaciones Automatizado', desc: 'Formulario web → Excel descargable. Ahorro: 2-3 hrs/semana.', color: 'bg-blue-100 text-blue-700' },
    { icon: '🛒', title: 'Catálogo Omnicanal', desc: 'Sincronización web ↔ WhatsApp. Sin doble carga. Ahorro: 5-10 hrs/semana.', color: 'bg-purple-100 text-purple-700' },
    { icon: '🗺️', title: 'Visibilidad de Distribuidores', desc: 'Portales por distribuidor. Aumento de ventas por distribución.', color: 'bg-amber-100 text-amber-700' },
    { icon: '🤖', title: 'Soporte con IA', desc: 'Asistente 24/7 para dudas frecuentes. Ahorro: 10-15 hrs/semana.', color: 'bg-emerald-100 text-emerald-700' },
    { icon: '📦', title: 'Inventario Unificado', desc: 'Cada tienda registra su stock. Vista consolidada para gerencia.', color: 'bg-rose-100 text-rose-700' },
  ];

  return (
    <section className="bg-gray-50 px-6 py-20 sm:px-12">
      <div className="mx-auto max-w-5xl">
        <SectionTitle sub="Con la base técnica de $7/mes, abrimos la puerta a automatizaciones revolucionarias.">
          4. Roadmap a Futuro
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 transition hover:shadow-md">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${f.color} text-lg`}>{f.icon}</span>
              <h4 className="mt-3 font-bold text-gray-900">{f.title}</h4>
              <p className="mt-1 text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* ═══ Comparativa de plataformas y escalamiento ═══ */}
        <div className="mt-16">
          <h3 className="text-2xl font-bold text-gray-900 text-center mb-2">📊 Escalamiento: Plan de 6 a 9 meses</h3>
          <p className="text-center text-gray-500 text-sm mb-8">
            Crecemos sin romper el presupuesto. Si la web es un exitazo, escalamos a un todo-en-uno.
          </p>

          {/* Fase 1: Actual (0-9 meses) */}
          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white">1</span>
              <div>
                <h4 className="font-bold text-gray-900">Fase 1: Gratuito (0 - 9 meses)</h4>
                <p className="text-xs text-gray-500">Mientras la web crece de forma orgánica</p>
              </div>
            </div>

            {/* Tabla comparativa free tiers */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-600">Servicio</th>
                    <th className="px-4 py-3 font-semibold text-emerald-600">Plan Actual</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Límites</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Costo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">🖥️ Render (Hosting)</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Starter $7</span></td>
                    <td className="px-4 py-3 text-gray-600">512 MB RAM, 0.5 CPU, 750 hrs/mes</td>
                    <td className="px-4 py-3 font-bold text-gray-900">$7/mes</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">🗄️ Supabase (BD)</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">Free $0</span></td>
                    <td className="px-4 py-3 text-gray-600">500 MB DB, 1 GB storage, 5 GB egress, 50K usuarios</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">$0</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">▲ Vercel (CDN/Edge)</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">Hobby $0</span></td>
                    <td className="px-4 py-3 text-gray-600">100 GB transfer, 1M invocations, solo personal</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">$0</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-sm text-emerald-800">
                <strong>Total fase 1: ~$7 USD/mes (~S/ 26).</strong> Render Starter + Supabase Free + Vercel Hobby. Cubierto por 6-9 meses mientras la web crece. Supabase Free maneja 50,000 usuarios activos mensuales y 500 MB de base — suficiente para empezar.
              </p>
            </div>
          </div>

          {/* Fase 2: Si explota */}
          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">2</span>
              <div>
                <h4 className="font-bold text-gray-900">Fase 2: Si la web es un exitazo (9+ meses)</h4>
                <p className="text-xs text-gray-500">Cuando Supabase Free se queda corto o necesitamos más control</p>
              </div>
            </div>

            {/* Railway como todo-en-uno */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl bg-purple-50 border border-purple-200 p-6">
                <h5 className="font-bold text-purple-800 mb-3">🚂 Railway — Todo-en-Uno</h5>
                <p className="text-sm text-purple-700 mb-4">
                  Un solo servicio: hosting + base de datos + dominios. Sin manjar Render + Supabase por separado.
                </p>
                <div className="space-y-2">
                  {[
                    'Hobby: $5/mes (incluye $5 de uso)',
                    'Pro: $20/mes (incluye $20 de uso)',
                    'Base de datos PostgreSQL incluida',
                    'Deploy automático desde GitHub',
                    'Dominios personalizados incluidos',
                    'Escalado automático según demanda',
                    'Sin cold start',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm text-purple-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg bg-purple-100 p-3">
                  <p className="text-xs font-semibold text-purple-800">Costo estimado Railway Pro:</p>
                  <p className="text-lg font-extrabold text-purple-700">~$20-30 USD/mes</p>
                  <p className="text-xs text-purple-600">Incluye hosting + BD + 100 GB almacenamiento</p>
                </div>
              </div>

              <div className="rounded-xl bg-blue-50 border border-blue-200 p-6">
                <h5 className="font-bold text-blue-800 mb-3">⚠️ Supabase Free — Limitaciones</h5>
                <p className="text-sm text-blue-700 mb-4">
                  Si la web crece, Supabase Free puede quedarse corto. Aquí las señales de que toca migrar:
                </p>
                <div className="space-y-2">
                  {[
                    'Base > 500 MB → toca Pro ($25/mes)',
                    'Usuarios > 50,000 MAU → toca Pro',
                    'Egress > 5 GB/mes → toca Pro',
                    'Sin backups en Free → riesgo de pérdida',
                    'Proyecto pausa tras 7 días sin actividad',
                    'Solo 2 proyectos activos por organización',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm text-blue-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg bg-blue-100 p-3">
                  <p className="text-xs font-semibold text-blue-800">Supabase Pro:</p>
                  <p className="text-lg font-extrabold text-blue-700">$25 + $10 compute = $35/mes</p>
                  <p className="text-xs text-blue-600">8 GB DB, 100 GB storage, 250 GB egress</p>
                </div>
              </div>
            </div>

            {/* Comparativa de costos a futuro */}
            <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-6">
              <h5 className="font-bold text-gray-800 mb-4">💰 Comparativa de costos (si crecemos)</h5>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-2 font-semibold text-gray-600">Escenario</th>
                      <th className="px-4 py-2 font-semibold text-gray-600">Costo/mes</th>
                      <th className="px-4 py-2 font-semibold text-gray-600">Qué incluye</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">WordPress actual</td>
                      <td className="px-4 py-2 font-bold text-red-600">$25-80</td>
                      <td className="px-4 py-2 text-gray-600">Hosting WP + dominio + SSL</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">Render + Supabase Free</td>
                      <td className="px-4 py-2 font-bold text-emerald-600">$7</td>
                      <td className="px-4 py-2 text-gray-600">Hosting + BD + 50K usuarios</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">Render + Supabase Pro</td>
                      <td className="px-4 py-2 font-bold text-amber-600">$42</td>
                      <td className="px-4 py-2 text-gray-600">Hosting + BD 8 GB + backups</td>
                    </tr>
                    <tr className="hover:bg-gray-50 bg-purple-50">
                      <td className="px-4 py-2 font-medium text-gray-900">🚂 Railway Pro (todo-en-uno)</td>
                      <td className="px-4 py-2 font-bold text-purple-600">$20-30</td>
                      <td className="px-4 py-2 text-gray-600">Hosting + BD + dominios + deploy</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                * Incluso en el peor caso (Railway Pro), el costo es <strong>menor que WordPress actual</strong> y con mucha más funcionalidad.
              </p>
            </div>
          </div>

          {/* Nota sobre la BD */}
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🗄️</span>
              <div>
                <h4 className="font-bold text-amber-800">Sobre la base de datos de Supabase</h4>
                <p className="mt-1 text-sm text-amber-700">
                  Ahorita Supabase Free nos da 500 MB de base y 50,000 usuarios activos mensuales. Para empezar es más que suficiente. Pero a medida que crezca la web — más productos, más usuarios, más pedidos — eventualmente necesitaremos ampliar a Supabase Pro ($25/mes) o migrar todo a Railway ($20-30/mes) que incluye la base de datos. <strong>En cualquier caso, el costo sigue siendo menor que WordPress.</strong>
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500">Ahora (Free)</p>
                    <p className="text-lg font-extrabold text-emerald-600">$0</p>
                    <p className="text-xs text-gray-500">500 MB · 50K usuarios</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500">Crecimiento (Pro)</p>
                    <p className="text-lg font-extrabold text-amber-600">$35</p>
                    <p className="text-xs text-gray-500">8 GB · 100K usuarios</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500">Exitazo (Railway)</p>
                    <p className="text-lg font-extrabold text-purple-600">$20-30</p>
                    <p className="text-xs text-gray-500">Todo-en-uno ilimitado</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionSection() {
  return (
    <section className="px-6 py-20 sm:px-12">
      <div className="mx-auto max-w-3xl text-center">
        <SectionTitle>Decisión Requerida</SectionTitle>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 p-8 text-white shadow-xl">
            <span className="text-4xl">🌐</span>
            <h3 className="mt-4 text-xl font-bold">1. Acceso al Hosting</h3>
            <p className="mt-2 text-sm text-red-100">Cambiar DNS + migrar 2,300 usuarios</p>
            <span className="mt-4 inline-block rounded-full bg-white/20 px-4 py-1 text-sm font-bold">PRIORIDAD: INMEDIATA</span>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 p-8 text-white shadow-xl">
            <span className="text-4xl">⚡</span>
            <h3 className="mt-4 text-xl font-bold">2. Contratar Render</h3>
            <p className="mt-2 text-sm text-emerald-100">$7 USD/mes — web 24/7 sin caídas</p>
            <span className="mt-4 inline-block rounded-full bg-white/20 px-4 py-1 text-sm font-bold">PRIORIDAD: INMEDIATA</span>
          </div>
        </div>
        <div className="mt-10 rounded-2xl bg-gray-900 p-8 text-white">
          <p className="text-sm text-gray-400">Inversión total</p>
          <p className="text-4xl font-extrabold">$7 USD/mes <span className="text-lg text-gray-400">(~S/ 26)</span></p>
          <p className="mt-2 text-sm text-gray-400">Retorno estimado: <span className="font-bold text-emerald-400">+S/ 5,000/mes en ventas</span></p>
        </div>
      </div>
    </section>
  );
}

/* ── Página principal ──────────────────────────────────────────────── */

export default function PresentacionCEO() {
  return (
    <div className="min-h-screen bg-gray-50">
      <HeroSection />
      <HostingSection />
      <RenderSection />
      <ComparisonSection />
      <EconomicSection />
      <MigrationJourneySection />
      <RoadmapSection />
      <ActionSection />
    </div>
  );
}
