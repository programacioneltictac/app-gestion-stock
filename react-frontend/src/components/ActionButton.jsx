import * as React from 'react';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

/**
 * Botón de acción unificado para las cabeceras de página (prop `actions` de
 * PageContainer) y barras de herramientas.
 *
 * Reglas de diseño (uniformes en toda la app):
 *  - SIEMPRE lleva texto + icono (no botones de solo icono en las cabeceras).
 *  - `size="small"` por defecto.
 *  - TODOS los botones son RELLENOS (variant="contained"); no usamos botones
 *    transparentes/outlined en las cabeceras, para un look uniforme.
 *  - `variant` (rol, no estilo MUI):
 *      'primary'   -> contained color primary  (acción principal: Crear, Sincronizar, Completar)
 *      'secondary' -> contained color primary  (acción de apoyo: Actualizar, Volver, Descargar)
 *      'danger'    -> contained color error     (Eliminar)
 *    Se puede sobreescribir el color con la prop `color` (ej. success/warning).
 *  - `loading`: muestra spinner en el icono y deshabilita el botón. `loadingText`
 *    (opcional) reemplaza el texto mientras carga.
 *
 * Cualquier otra prop (color, disabled, sx, ...) se pasa tal cual al Button.
 */
const VARIANT_MAP = {
  primary:   { variant: 'contained', color: 'primary' },
  secondary: { variant: 'contained', color: 'primary' },
  danger:    { variant: 'contained', color: 'error' },
};

export default function ActionButton({
  children,
  icon,
  variant = 'secondary',
  color,
  size = 'small',
  loading = false,
  loadingText,
  disabled,
  startIcon,
  ...rest
}) {
  const mapped = VARIANT_MAP[variant] || { variant };
  const resolvedColor = color || mapped.color;
  const resolvedIcon = loading
    ? <CircularProgress size={16} color="inherit" />
    : (startIcon || icon);

  return (
    <Button
      variant={mapped.variant}
      {...(resolvedColor ? { color: resolvedColor } : {})}
      size={size}
      startIcon={resolvedIcon}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && loadingText ? loadingText : children}
    </Button>
  );
}
