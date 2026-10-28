import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

/** Barra de selección de ítems para generar una orden parcial. */
export default function OrderSelectionBar({
  selectedCount,
  orderableCount,
  visibleOrderableCount,
  hiddenSelectedCount,
  noFiltersActive,
  onSelectAll,
  onClear,
}) {
  return (
    <Stack direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
      <Typography variant="body2" color="text.secondary">
        {selectedCount > 0
          ? `${selectedCount} ítem(s) seleccionado(s) para pedir`
          : `${orderableCount} ítem(s) pendiente(s) de pedir`}
      </Typography>
      {/* Selecciona solo lo visible: con un filtro puesto, autoseleccionar
          items ocultos arma ordenes con cosas que no estan en pantalla. El
          texto dice cuantos son para que no haya sorpresa. */}
      <Button
        size="small"
        onClick={onSelectAll}
        disabled={visibleOrderableCount === 0}
      >
        {noFiltersActive
          ? "Seleccionar todos los pendientes"
          : `Seleccionar los ${visibleOrderableCount} pendiente(s) visible(s)`}
      </Button>
      {hiddenSelectedCount > 0 && (
        <Tooltip title="Entrarían en la orden aunque el filtro no los muestre">
          <Chip
            label={`${hiddenSelectedCount} seleccionado(s) fuera del filtro`}
            size="small"
            color="warning"
            variant="outlined"
          />
        </Tooltip>
      )}
      {selectedCount > 0 && (
        <Button size="small" color="inherit" onClick={onClear}>
          Limpiar selección
        </Button>
      )}
    </Stack>
  );
}
