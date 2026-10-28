import * as React from "react";
import {
  getStockItems,
  getAvailableProducts,
  getConditions,
  getControlById,
  getDiscontinuedProducts,
  getPromoProducts,
} from "../../data/stock";

/**
 * Datos de la pantalla de un control: el control, sus ítems, el catálogo de
 * productos del rubro y las condiciones; más los discontinuos y promo, que se
 * cargan recién al entrar a su pestaña.
 */
export default function useStockControlData(branchId, controlId, notifications) {
  const [control, setControl] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [lastSyncAt, setLastSyncAt] = React.useState(null);
  const [availableProducts, setAvailableProducts] = React.useState([]);
  const [conditions, setConditions] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const [discontinued, setDiscontinued] = React.useState([]);
  const [discLoaded, setDiscLoaded] = React.useState(false);
  const [isLoadingDisc, setIsLoadingDisc] = React.useState(false);

  const [promo, setPromo] = React.useState([]);
  const [promoLoaded, setPromoLoaded] = React.useState(false);
  const [isLoadingPromo, setIsLoadingPromo] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      // El control trae su rubro (categoryId), necesario para filtrar el catálogo.
      const controlData = await getControlById(Number(controlId));
      if (!controlData) throw new Error("Control no encontrado");

      const [itemsData, productsData, conditionsData] = await Promise.all([
        getStockItems(Number(controlId)),
        getAvailableProducts(Number(branchId), controlData.categoryId),
        getConditions(),
      ]);
      setControl(controlData);
      setItems(itemsData.items);
      setLastSyncAt(itemsData.lastSyncAt);
      setAvailableProducts(productsData);
      setConditions(conditionsData);
    } catch (loadError) {
      setError(loadError);
    }
    setIsLoading(false);
  }, [branchId, controlId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Recarga solo los ítems (y el catálogo si `reloadCatalog`), tras un alta o
  // edición: el control y las condiciones no cambian.
  const reloadItems = React.useCallback(
    async (reloadCatalog) => {
      const [itemsData, productsData] = await Promise.all([
        getStockItems(Number(controlId)),
        reloadCatalog ? getAvailableProducts(Number(branchId), control.categoryId) : Promise.resolve(null),
      ]);
      setItems(itemsData.items);
      setLastSyncAt(itemsData.lastSyncAt);
      if (productsData) setAvailableProducts(productsData);
    },
    [branchId, controlId, control]
  );

  const removeItem = React.useCallback((itemId) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  // Carga (lazy) de discontinuos: solo la primera vez que se entra a la tab.
  // Devuelve el array cargado (lo usa también la exportación a Excel).
  const loadDiscontinued = React.useCallback(async () => {
    setIsLoadingDisc(true);
    try {
      const data = await getDiscontinuedProducts(Number(controlId));
      setDiscontinued(data);
      setDiscLoaded(true);
      return data;
    } catch (err) {
      notifications.show(`Error al cargar discontinuos: ${err.message}`, {
        severity: "error",
        autoHideDuration: 4000,
      });
      throw err;
    } finally {
      setIsLoadingDisc(false);
    }
  }, [controlId, notifications]);

  // Carga (lazy) de productos PROMO: solo la primera vez que se entra a la tab.
  const loadPromo = React.useCallback(async () => {
    setIsLoadingPromo(true);
    try {
      const data = await getPromoProducts(Number(controlId));
      setPromo(data);
      setPromoLoaded(true);
    } catch (err) {
      notifications.show(`Error al cargar promo: ${err.message}`, {
        severity: "error",
        autoHideDuration: 4000,
      });
    } finally {
      setIsLoadingPromo(false);
    }
  }, [controlId, notifications]);

  return {
    control,
    items,
    lastSyncAt,
    availableProducts,
    conditions,
    isLoading,
    error,
    loadData,
    reloadItems,
    removeItem,
    discontinued,
    discLoaded,
    isLoadingDisc,
    loadDiscontinued,
    promo,
    promoLoaded,
    isLoadingPromo,
    loadPromo,
  };
}
