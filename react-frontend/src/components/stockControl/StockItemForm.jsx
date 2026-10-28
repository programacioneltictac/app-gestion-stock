import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

/**
 * Formulario inline de alta/edición de un ítem del control (solo en borrador).
 * El estado vive en useStockItemForm: la grilla también lo usa (botón Editar).
 */
export default function StockItemForm({ form, availableProducts, conditions, canAdd }) {
  const {
    selectedProduct,
    setSelectedProduct,
    selectedCondition,
    setSelectedCondition,
    stockRequire,
    setStockRequire,
    isSaving,
    editingItemId,
    handleUpsertItem,
    handleCancelEdit,
  } = form;

  return (
    <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
      <Autocomplete
        size="small"
        options={availableProducts}
        getOptionLabel={(o) => o.displayName || ""}
        value={selectedProduct}
        onChange={(_, val) => setSelectedProduct(val)}
        isOptionEqualToValue={(o, v) => o.key === v.key}
        // En edición el producto queda fijo (se edita condición/stock mínimo).
        disabled={editingItemId !== null}
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.key}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {option.displayName}
              </Typography>
              {option.isGlobal && (
                <Chip label="sin stock" size="small" variant="outlined" color="default" />
              )}
            </Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField {...params} label="Producto" placeholder="Buscar producto..." />
        )}
        sx={{ minWidth: 340 }}
      />
      <Autocomplete
        size="small"
        options={conditions}
        getOptionLabel={(o) => o.condition_name || ""}
        value={conditions.find((c) => c.id === selectedCondition) || null}
        onChange={(_, val) => setSelectedCondition(val ? val.id : "")}
        isOptionEqualToValue={(o, v) => o.id === v.id}
        renderInput={(params) => (
          <TextField {...params} label="Condición" />
        )}
        sx={{ minWidth: 160 }}
      />
      <TextField
        size="small"
        label="Stock mínimo"
        type="number"
        value={stockRequire}
        onChange={(e) => setStockRequire(e.target.value)}
        inputProps={{ min: 0 }}
        sx={{ width: 140 }}
      />
      <Button
        variant="contained"
        onClick={handleUpsertItem}
        disabled={!canAdd || isSaving}
        startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : null}
      >
        {isSaving
          ? "Guardando..."
          : editingItemId !== null
            ? "Guardar cambios"
            : "Agregar"}
      </Button>
      {editingItemId !== null && (
        <Button variant="text" color="inherit" onClick={handleCancelEdit} disabled={isSaving}>
          Cancelar
        </Button>
      )}
    </Stack>
  );
}
