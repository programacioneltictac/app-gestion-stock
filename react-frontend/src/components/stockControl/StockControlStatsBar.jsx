import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { formatDateTime } from "../../utils/format";
import { STATUS_CHIPS } from "./stockControlShared";

/**
 * Barra superior del control: estado, chips de filtro (Total / estados /
 * Sin gestionar / condiciones) y medidas (compliance, última sync).
 */
export default function StockControlStatsBar({ control, stats, lastSyncAt, filters }) {
  const {
    statusFilter,
    conditionFilter,
    unmanagedOnly,
    noFiltersActive,
    conditionOptions,
    toggleStatusFilter,
    toggleConditionFilter,
    toggleUnmanaged,
    clearAllFilters,
  } = filters;

  return (
    <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap">
      <Chip
        label={control.statusName}
        color={
          control.status === "completed" ? "success"
            : control.status === "discontinued" ? "default"
            : "warning"
        }
        size="small"
      />
      {/* Total / En falta / Óptimo / Sobrestock son chips que filtran la
          tabla. Multi-seleccion entre los de estado; "Total" limpia todo.
          Compliance y Última sync quedan como texto: son medidas, no
          categorias por las que se pueda recortar el listado. */}
      <Chip
        label={`Total: ${stats.total}`}
        size="small"
        onClick={clearAllFilters}
        color={noFiltersActive ? "primary" : "default"}
        variant={noFiltersActive ? "filled" : "outlined"}
      />
      {STATUS_CHIPS.map(({ id, label, color, statKey }) => {
        const isActive = statusFilter.includes(id);
        return (
          <Chip
            key={id}
            label={`${label}: ${stats[statKey]}`}
            size="small"
            onClick={() => toggleStatusFilter(id)}
            color={isActive ? color : "default"}
            variant={isActive ? "filled" : "outlined"}
            sx={isActive ? undefined : { color: `${color}.main`, borderColor: `${color}.main` }}
          />
        );
      })}
      <Typography variant="body2">Compliance: <strong>{stats.avg.toFixed(1)}%</strong></Typography>
      <Tooltip title="Faltantes reponibles todavía sin pedir (sin orden en gestión). Es la cifra accionable: lo que falta llevar a una orden.">
        <Chip
          label={`Sin gestionar: ${stats.unmanaged}`}
          size="small"
          onClick={toggleUnmanaged}
          color={unmanagedOnly ? "warning" : "default"}
          variant={unmanagedOnly ? "filled" : "outlined"}
          sx={
            unmanagedOnly
              ? undefined
              : { color: "warning.main", borderColor: "warning.main" }
          }
        />
      </Tooltip>
      {/* Chips de condicion. Se cruzan con los de estado (AND) y van en
          gris para que se lean como otro grupo: los de estado usan los
          colores semanticos (rojo/verde/amarillo) y repetirlos aca haria
          parecer que son lo mismo. Solo aparecen si hay mas de una
          condicion: con una sola el chip no discrimina nada. Excepcion: si
          esa unica condicion esta ACTIVA (se llego con ?filter=muyprioritario
          a un control donde todo es MUY PRIORITARIO), el chip se muestra
          igual; si no, la tabla quedaria filtrada por un chip invisible y
          sin forma de apagarlo. */}
      {(conditionOptions.length > 1 || conditionFilter.length > 0) &&
        conditionOptions.map(({ id, name, count }) => {
          const isActive = conditionFilter.includes(id);
          return (
            <Chip
              key={`cond-${id}`}
              label={`${name}: ${count}`}
              size="small"
              onClick={() => toggleConditionFilter(id)}
              color={isActive ? "info" : "default"}
              variant={isActive ? "filled" : "outlined"}
            />
          );
        })}
      {formatDateTime(lastSyncAt) && (
        <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
          Última sync: <strong>{formatDateTime(lastSyncAt)}</strong>
        </Typography>
      )}
    </Stack>
  );
}
