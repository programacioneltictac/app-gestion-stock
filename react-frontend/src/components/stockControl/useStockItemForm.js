import * as React from "react";
import { upsertStockItem } from "../../data/stock";

/**
 * Estado del formulario inline de alta/edición de ítems del control.
 * editingItemId != null => modo edición de un ítem ya cargado (recupera
 * producto/condición/stock mínimo en el form).
 */
export default function useStockItemForm(controlId, reloadItems, notifications) {
  const [selectedProduct, setSelectedProduct] = React.useState(null);
  const [selectedCondition, setSelectedCondition] = React.useState("");
  const [stockRequire, setStockRequire] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [editingItemId, setEditingItemId] = React.useState(null);

  const reset = React.useCallback(() => {
    setEditingItemId(null);
    setSelectedProduct(null);
    setSelectedCondition("");
    setStockRequire("");
  }, []);

  const handleUpsertItem = React.useCallback(async () => {
    if (!selectedProduct || stockRequire === "" || Number(stockRequire) < 0) return;

    setIsSaving(true);
    try {
      await upsertStockItem(Number(controlId), selectedProduct.ref, Number(stockRequire), selectedCondition || null);
      // Si era un producto del catálogo global, ahora ya existe en la sucursal:
      // recargamos el catálogo para que pase a la lista local.
      await reloadItems(selectedProduct.isGlobal);
      reset();
    } catch (err) {
      notifications.show(`Error al guardar: ${err.message}`, {
        severity: "error",
        autoHideDuration: 4000,
      });
    }
    setIsSaving(false);
  }, [selectedProduct, stockRequire, selectedCondition, controlId, reloadItems, reset, notifications]);

  // Edición: recupera un ítem ya cargado en el mismo formulario de alta. El
  // upsert del backend (ON CONFLICT por product_stock_id) lo actualiza en vez
  // de duplicar. Se construye un selectedProduct sintético con la ref del psb
  // (el ítem ya existe en la sucursal). No editable si ya fue pedido (ordered_at).
  const handleEditItem = React.useCallback((item) => {
    setEditingItemId(item.id);
    setSelectedProduct({
      key: `edit-${item.productStockId}`,
      displayName: item.displayName,
      isGlobal: false,
      ref: { productStockId: item.productStockId },
    });
    setSelectedCondition(item.conditionId || "");
    setStockRequire(String(item.stockRequire));
  }, []);

  return {
    selectedProduct,
    setSelectedProduct,
    selectedCondition,
    setSelectedCondition,
    stockRequire,
    setStockRequire,
    isSaving,
    editingItemId,
    handleUpsertItem,
    handleEditItem,
    handleCancelEdit: reset,
  };
}
