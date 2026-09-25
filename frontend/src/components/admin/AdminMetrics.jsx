import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { metricsAPI } from '../../lib/api';
import {
  Cpu, MemoryStick, Activity, Timer, RefreshCw, Loader2, AlertCircle, ShieldOff,
} from '../../lib/icons';

const ALLOWED = ['ADMIN', 'DESARROLLADOR_WEB'];

function MB(n) { return `${Number(n).toFixed(1)} MB`; }

function StatCard({ icon: Icon, title, value, sub, accent = 'text-brand' }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${accent}`} />
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function Bar({ label, used, total }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand';
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="text-xs text-gray-400">{used} / {total}</span>
      </div>
      <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AdminMetrics() {
  const { user, accessToken } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await metricsAPI.get(accessToken);
      setData(res);
    } catch (e) {
      setError(e?.error || e?.message || 'No se pudieron cargar las métricas');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (!user || !ALLOWED.includes(user.rol)) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 flex flex-col items-center text-center">
          <ShieldOff className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">No tienes permiso para ver las métricas</p>
          <p className="text-xs text-gray-400 mt-1">Solo los roles ADMIN y DESARROLLADOR_WEB.</p>
        </div>
      </div>
    );
  }

  const mem = data?.memory;
  const req = data?.requests;
  const statusList = req?.byStatus ? Object.entries(req.byStatus) : [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Métricas del servidor</h1>
          <p className="text-sm text-gray-500">Estado en vivo del backend en Render</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-brand hover:bg-brand/10 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando métricas...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      ) : mem ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={Cpu} title="RAM (RSS)" value={MB(mem.rssMB)} accent="text-emerald-500" />
            <StatCard icon={MemoryStick} title="Heap usado" value={MB(mem.heapUsedMB)} sub={`límite ${MB(mem.heapLimitMB)}`} />
            <StatCard icon={Timer} title="Latencia media" value={`${req.avgResponseTimeMs} ms`} sub={`máx ${req.maxResponseTimeMs} ms`} />
            <StatCard icon={Activity} title="Requests" value={req.total} sub={`${req.inFlight} en vuelo`} />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
            <h2 className="text-sm font-bold text-gray-700 mb-4">Memoria / heap</h2>
            <Bar label="RSS (proceso)" used={MB(mem.rssMB)} total={MB(mem.heapLimitMB)} />
            <Bar label="Heap usado" used={MB(mem.heapUsedMB)} total={MB(mem.heapTotalMB || mem.heapLimitMB)} />
            <p className="text-xs text-gray-400 mt-2">
              Regla: mantener el heap muy por debajo de {MB(mem.heapLimitMB)} para margen sano en el tier de 512MB.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Detalle</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Uptime</dt><dd className="font-medium">{Math.floor(data.uptimeSec / 60)} min</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">PID</dt><dd className="font-medium">{data.pid}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Iniciado</dt><dd className="font-medium">{new Date(data.startedAt).toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Por status</dt><dd className="font-medium">
                {statusList.length ? statusList.map(([s, n]) => `${s}: ${n}`).join(' · ') : '-'}
              </dd></div>
            </dl>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-500">Sin datos disponibles.</p>
      )}
    </div>
  );
}
