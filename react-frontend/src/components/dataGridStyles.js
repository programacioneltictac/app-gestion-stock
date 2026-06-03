import { gridClasses } from "@mui/x-data-grid";

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
