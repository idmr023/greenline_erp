import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, RefreshCw, CheckCircle2, AlertCircle } from '../../lib/icons';

export default function AdminEmails() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('email_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setItems(data || []);
    setLoading(false);
  }

  function formatFecha(iso) {
    try {
      return new Date(iso).toLocaleString('es-PE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historial de Correo (Email Logs)</h1>
          <p className="text-sm text-gray-500 mt-1">
            Registro y auditoría de todos los correos electrónicos enviados y encolados por el sistema.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Recargar
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Cargando registros de correo...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          No hay correos registrados todavía.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">Fecha / Hora</th>
                  <th className="p-4">Destinatario</th>
                  <th className="p-4">Asunto</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Detalle / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 text-xs text-gray-500 whitespace-nowrap">{formatFecha(log.created_at)}</td>
                    <td className="p-4 font-semibold text-gray-900">{log.destinatario}</td>
                    <td className="p-4 text-gray-700">{log.asunto}</td>
                    <td className="p-4 whitespace-nowrap">
                      {log.estado === 'ENVIADO' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> En enviado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700">
                          <AlertCircle className="w-3.5 h-3.5" /> Error
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-gray-500 max-w-xs truncate">
                      {log.error || (log.meta ? JSON.stringify(log.meta) : '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
