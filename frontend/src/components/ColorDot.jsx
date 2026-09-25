import { colorDotClassFor, hexFromColores } from '../lib/colores';

export function ColorDot({ nombre, coloresDetalle, className = '' }) {
  const hex = hexFromColores(coloresDetalle, nombre);

  if (hex) {
    return (
      <span
        className={`inline-block rounded-full border border-gray-200 ${className}`}
        style={{ backgroundColor: hex }}
      />
    );
  }

  return (
    <span
      className={`inline-block rounded-full border border-gray-200 ${colorDotClassFor(nombre)} ${className}`}
    />
  );
}

export default ColorDot;
