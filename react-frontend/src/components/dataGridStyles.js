import { gridClasses } from "@mui/x-data-grid";
import { thinScrollbarPlainSx } from "../utils/scrollStyles";

// Estilos compartidos para todos los DataGrid de la app:
// elimina el outline default en headers/celdas y opcionalmente
// muestra el cursor pointer en filas clickeables.
export const dataGridSx = {
  [`& .${gridClasses.columnHeader}, & .${gridClasses.cell}`]: {
    outline: "transparent",
  },
  [`& .${gridClasses.columnHeader}:focus-within, & .${gridClasses.cell}:focus-within`]: {
    outline: "none",
  },
  // Misma barra fina que el resto de la app. Va sobre el viewport virtualizado
  // (el que scrollea de verdad), no sobre la raiz del grid.
  // ⚠️ Se usa la variante PLANA a proposito: este objeto se consume con spread
  // (`...dataGridSx` en OrderShow), y convertirlo en funcion (theme) => ({...})
  // romperia ese spread en silencio, sin error de compilacion.
  [`& .${gridClasses.virtualScroller}`]: thinScrollbarPlainSx,
};

export const dataGridClickableSx = {
  ...dataGridSx,
  [`& .${gridClasses.row}:hover`]: { cursor: "pointer" },
};

export const dataGridLoadingSlotProps = {
  loadingOverlay: {
    variant: "circular-progress",
    noRowsVariant: "circular-progress",
  },
};
