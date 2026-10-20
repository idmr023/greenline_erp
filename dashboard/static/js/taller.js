/**
 * Bloque "Taller" del dashboard de Servicio Técnico.
 *
 * Los datos vienen de la API del backend (módulos del taller: evaluación de
 * incentivos, garantías y reporte de ensamblado) y se piden en vivo desde el
 * navegador: el panel (que está embebido en un <iframe>) entrega su token
 * por `postMessage` y esta pantalla lo reenvía al dashboard en la cabecera
 * `X-GL-Token`. El dashboard lo pasa al backend como `Authorization: Bearer`.
 *
 * Sin token (dashboard abierto fuera del panel) el bloque avisa y no rompe.
 */
(function () {
  const CFG = window.__GL_TALLER__ || {};
  const estado = document.getElementById('taller-estado');
  const contenido = document.getElementById('taller-contenido');
  const selMes = document.getElementById('taller-mes');
  const selTienda = document.getElementById('taller-tienda');
  const btnRecargar = document.getElementById('taller-recargar');
  if (!estado || !contenido || !selMes) return;

  const origenes = CFG.origenes || [];
  let token = null;
  let cargando = false;

  // ---------- utilidades ----------
  function esc(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function num(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  function nombreMes(clave) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const m = /^(\d{4})-(\d{2})$/.exec(clave || '');
    if (!m) return 'Todos los meses';
    return `${meses[Number(m[2]) - 1]} ${m[1]}`;
  }

  function ultimosMeses(cantidad) {
    const salida = [];
    const hoy = new Date();
    for (let i = 0; i < cantidad; i += 1) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      salida.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return salida;
  }

  function colorPuntaje(valor) {
    const v = num(valor);
    if (v >= 70) return 'verde';
    if (v >= 40) return 'amarillo';
    return 'rojo';
  }

  // ---------- filtros ----------
  function pintarMeses() {
    const hoy = new Date();
    const actual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    selMes.innerHTML = '<option value="">Todos los meses</option>';
    ultimosMeses(18).forEach((m) => {
      const op = document.createElement('option');
      op.value = m;
      op.textContent = nombreMes(m);
      selMes.appendChild(op);
    });
    selMes.value = actual;
  }

  function pintarTiendas(tiendas) {
    const actual = selTienda.value;
    selTienda.innerHTML = '<option value="">Todas las tiendas</option>';
    (tiendas || []).forEach((t) => {
      const op = document.createElement('option');
      op.value = t.id;
      op.textContent = t.nombre || t.name || t.id;
      selTienda.appendChild(op);
    });
    selTienda.value = actual;
  }

  // ---------- render ----------
  function tabla(columnas, filas, vacio) {
    if (!filas.length) return `<p class="sutil">${esc(vacio || 'Sin datos.')}</p>`;
    const head = columnas.map((c) => `<th>${esc(c)}</th>`).join('');
    const body = filas
      .map((fila) => `<tr>${fila.map((celda) => `<td>${celda}</td>`).join('')}</tr>`)
      .join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function seccionPuntajes(datos) {
    const bloque = datos.puntajes || {};
    const tarjetas = (bloque.puntajes || []).map((p) => {
      const porcentaje = Math.max(0, Math.min(100, num(p.general)));
      const tiendas = (p.tiendas || [])
        .map((t) => `<div class="taller-mini"><span>${esc(t.nombre)}</span><span>${esc(t.evaluaciones)} eval.</span></div>`)
        .join('');
      return `<div class="tarjeta kpi taller-kpi">
        <div class="taller-kpi-cab">
          <strong>${esc(p.nombre)}</strong>
          <span class="badge ${colorPuntaje(p.general)}">${esc(p.general)}</span>
        </div>
        <div class="taller-barra"><i style="width:${porcentaje}%" class="${colorPuntaje(p.general)}"></i></div>
        <p class="sutil">${esc(p.evaluaciones)} evaluación(es) · ${(p.tiendas || []).length} tienda(s)</p>
        ${tiendas}
      </div>`;
    }).join('');

    const porTienda = (bloque.porTienda || []).map((t) => `<div class="taller-mini">
        <span>${esc(t.nombre)}</span>
        <span>${esc((t.tecnicos || []).join(', '))} · ${esc(t.evaluaciones)} eval.</span>
      </div>`).join('');

    return `<h3>Puntaje general de armadores</h3>
      <p class="sutil">Los técnicos rotan: cada tienda acumula las evaluaciones de quien estaba ahí, sin importar su tienda base.</p>
      <div class="tarjetas">${tarjetas || '<p class="sutil">Sin puntajes en el periodo.</p>'}</div>
      ${porTienda ? `<h3>Reparto por tienda</h3><div class="taller-minis">${porTienda}</div>` : ''}`;
  }

  function seccionGarantias(datos) {
    const bloque = datos.garantias || {};
    const resumen = bloque.resumen || {};
    const porEstado = (resumen.porEstado || []).map((e) => `<div class="tarjeta kpi">
        <span class="kpi-etiqueta">${esc(e.estado)}</span>
        <span class="kpi-valor">${esc(e.count)}</span>
      </div>`).join('');
    const filas = (bloque.casos || []).slice(0, 50).map((g) => [
      esc(g.correlativo),
      esc(g.clienteNombre),
      esc(g.placa || g.numeroSerie),
      esc(g.tipoGarantia),
      esc(g.estado),
      esc((g.fechaReclamo || '').slice(0, 10)),
    ]);
    return `<h3>Registro de garantías</h3>
      <div class="tarjetas">
        <div class="tarjeta kpi"><span class="kpi-etiqueta">Casos</span><span class="kpi-valor">${esc(resumen.total || 0)}</span></div>
        ${porEstado}
      </div>
      ${tabla(['Correlativo', 'Cliente', 'Placa / VIN', 'Tipo', 'Estado', 'Reclamo'], filas, 'Sin garantías en el periodo.')}`;
  }

  function seccionEnsamblado(datos) {
    const bloque = datos.ensamblado || {};
    const resumen = bloque.resumen || {};
    const porEstado = (resumen.porEstado || []).map((e) => `<div class="tarjeta kpi">
        <span class="kpi-etiqueta">${esc(e.estado)}</span>
        <span class="kpi-valor">${esc(e.count)}</span>
      </div>`).join('');
    const porTienda = (resumen.porTienda || []).map((t) => `<div class="taller-mini">
        <span>${esc(t.nombre)}</span><span>${esc(t.count)}</span></div>`).join('');
    const porTecnico = (resumen.porTecnico || []).map((t) => `<div class="taller-mini">
        <span>${esc(t.nombre)}</span><span>${esc(t.count)}</span></div>`).join('');
    const filas = (bloque.registros || []).slice(0, 50).map((r) => [
      esc((r.fecha || '').slice(0, 10)),
      esc(r.codigo || r.numero),
      esc(r.tipoArmado || r.estado),
      esc(r.estado),
      esc(r.tecnico?.nombre),
    ]);
    return `<h3>Reporte de ensamblado</h3>
      <div class="tarjetas">
        <div class="tarjeta kpi"><span class="kpi-etiqueta">Registros</span><span class="kpi-valor">${esc(resumen.total || 0)}</span></div>
        ${porEstado}
      </div>
      <div class="taller-columnas">
        <div><h3>Por tienda</h3><div class="taller-minis">${porTienda || '<p class="sutil">Sin datos.</p>'}</div></div>
        <div><h3>Por responsable</h3><div class="taller-minis">${porTecnico || '<p class="sutil">Sin datos.</p>'}</div></div>
      </div>
      ${tabla(['Fecha', 'Código', 'Tipo', 'Estado', 'Responsable'], filas, 'Sin registros en el periodo.')}`;
  }

  function seccionEvaluaciones(datos) {
    const filas = (datos.evaluaciones || []).slice(0, 50).map((ev) => [
      esc((ev.fecha || '').slice(0, 10)),
      esc(ev.tecnico?.nombre),
      esc(ev.tienda?.name || ev.tienda?.nombre),
      esc(ev.criterio?.nombre),
      esc(ev.puntaje),
      esc(ev.descripcion),
    ]);
    return `<h3>Historial de evaluaciones</h3>
      ${tabla(['Fecha', 'Técnico', 'Tienda', 'Condición', 'Puntaje', 'Motivo'], filas, 'Sin evaluaciones en el periodo.')}`;
  }

  function seccionRotacion(datos) {
    const filas = (datos.tecnicos || []).map((t) => [
      esc(t.nombre),
      esc(t.tienda?.name || t.tienda?.nombre || '—'),
      esc((t.rotaciones || []).length),
    ]);
    return `<h3>Rotación de técnicos</h3>
      ${tabla(['Técnico', 'Tienda base', 'Rotaciones'], filas, 'Sin técnicos registrados.')}`;
  }

  function render(datos) {
    const bloques = [
      seccionPuntajes(datos),
      seccionEvaluaciones(datos),
      seccionGarantias(datos),
      seccionEnsamblado(datos),
      seccionRotacion(datos),
    ];
    contenido.innerHTML = bloques.join('');
    pintarTiendas(datos.tiendas);
    const avisos = datos.errores || [];
    estado.textContent = avisos.length
      ? `Datos cargados con avisos: ${avisos.join(' · ')}`
      : `Actualizado · ${nombreMes(datos.mes)}`;
  }

  // ---------- datos ----------
  async function cargar() {
    if (cargando) return;
    if (!token) {
      estado.textContent = 'Inicia sesión en el panel para ver los datos del taller.';
      contenido.innerHTML = '';
      return;
    }
    cargando = true;
    estado.textContent = 'Cargando datos del taller…';
    const params = new URLSearchParams();
    if (selMes.value) params.set('mes', selMes.value);
    if (selTienda.value) params.set('tiendaId', selTienda.value);
    try {
      const resp = await fetch(`${CFG.url}?${params.toString()}`, {
        headers: { 'X-GL-Token': token },
      });
      const datos = await resp.json();
      if (!resp.ok) throw new Error(datos.error || `Error ${resp.status}`);
      render(datos);
    } catch (err) {
      estado.textContent = err.message || 'No se pudieron cargar los datos del taller.';
      contenido.innerHTML = '';
    } finally {
      cargando = false;
    }
  }

  // ---------- token por postMessage ----------
  window.addEventListener('message', (ev) => {
    if (origenes.length && !origenes.includes(ev.origin)) return;
    const datos = ev.data;
    if (!datos || datos.tipo !== 'gl:taller-token') return;
    token = datos.token || null;
    if (token) cargar();
  });

  selMes.addEventListener('change', cargar);
  selTienda.addEventListener('change', cargar);
  if (btnRecargar) btnRecargar.addEventListener('click', cargar);

  pintarMeses();
  // Si el dashboard se abrió sin panel, se avisa de entrada.
  setTimeout(() => {
    if (!token) {
      estado.textContent = 'Inicia sesión en el panel para ver los datos del taller.';
    }
  }, 3000);
})();
