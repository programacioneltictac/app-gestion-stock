import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { DataGrid } from "@mui/x-data-grid";
import { dataGridSx } from "../dataGridStyles";
import { formatCurrency } from "../../utils/format";

// Columnas de las tablas de discontinuos y promo (solo lectura): Producto, Rubro,
// Stock, Costo unit., Total valorizado (= stock * costo unit.). Constantes: no
// dependen de nada del componente.
const VALUED_COLUMNS = [
  { field: "displayName", headerName: "Producto", flex: 1, minWidth: 220 },
  { field: "categoryName", headerName: "Rubro", width: 130 },
  { field: "stock", headerName: "Stock", width: 100, type: "number" },
  {
    field: "avgCost",
    headerName: "Costo unit.",
    width: 130,
    type: "number",
    renderCell: ({ value }) => (
      <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
        <Typography variant="body2">{value > 0 ? formatCurrency(value) : "-"}</Typography>
      </Box>
    ),
  },
  {
    field: "totalValue",
    headerName: "Total valorizado",
    width: 150,
    type: "number",
    // stock * costo unit. (del sync). Se calcula de la fila, no viene del backend.
    valueGetter: (_value, row) => (Number(row.stock) || 0) * (Number(row.avgCost) || 0),
    renderCell: ({ value }) => (
      <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
        <Typography variant="body2" fontWeight={500}>
          {value > 0 ? formatCurrency(value) : "-"}
        </Typography>
      </Box>
    ),
  },
];

/** Tabla valorizada de solo lectura (pestañas Discontinuos y Promo). */
export default function ValuedProductsGrid({ rows, loading, description }) {
  return (
    <Box sx={{ flex: 1, width: "100%" }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {description}
      </Typography>
      <DataGrid
        rows={rows}
        columns={VALUED_COLUMNS}
        disableRowSelectionOnClick
        loading={loading}
        autoHeight
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        sx={dataGridSx}
      />
    </Box>
  );
}
