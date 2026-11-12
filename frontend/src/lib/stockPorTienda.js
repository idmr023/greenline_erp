export function stockPorColor(colores, existencias, tiendaId) {
  const porColor = new Map(
    existencias
      .filter((fila) => fila.tienda_id === tiendaId)
      .map((fila) => [String(fila.color_id), fila.stock]),
  );

  return colores
    .filter((color) => color.color_id && color.nombre)
    .map((color) => ({
      ...color,
      stockTienda: porColor.has(String(color.color_id))
        ? porColor.get(String(color.color_id))
        : null,
    }));
}

export function stockPorColorAlmacen(colores, existencias) {
  const porColor = new Map(
    existencias.map((fila) => [String(fila.color_id), fila.stock]),
  );
  return colores
    .filter((color) => color.color_id && color.nombre)
    .map((color) => ({
      ...color,
      stockTienda: porColor.has(String(color.color_id))
        ? porColor.get(String(color.color_id))
        : null,
    }));
}

export function imagenesConStock(imagenes, colores) {
  const nombres = new Set(
    colores.filter((color) => color.stockTienda > 0).map((color) => color.nombre),
  );
  return imagenes.filter((imagen) => imagen.url && nombres.has(imagen.color));
}

export function validarCantidadInicial(valor) {
  const texto = String(valor).trim();
  if (!/^\d+$/.test(texto)) return null;
  const cantidad = Number(texto);
  return Number.isSafeInteger(cantidad) && cantidad <= 2147483647 ? cantidad : null;
}

export function borradoresDeUbicacion(borradores, tiendaId) {
  return borradores.filter((fila) => (
    tiendaId === 'almacen' ? fila.tienda_id === null : fila.tienda_id === tiendaId
  ));
}

export function totalBorradores(borradores) {
  return borradores.reduce((total, fila) => total + fila.stock, 0);
}
