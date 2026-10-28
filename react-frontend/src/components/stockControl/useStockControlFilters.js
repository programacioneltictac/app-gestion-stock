import * as React from "react";
import { CONDITION } from "../../constants";
import { isUnmanaged } from "./stockControlShared";

/**
 * Chips de filtro del control (estado, condición y "Sin gestionar") y las
 * filas que dejan visibles.
 *
 * Filtro de llegada desde el dashboard (?filter=). TODOS los modos se traducen
 * a chips encendidos (ninguno es un modo aparte con banner), para que los
 * accesos desde el dashboard se vean y se apaguen siempre igual:
 *  - "needorder":      chip "En falta" (status 1).
 *  - "overstock":      chip "Sobrestock" (status 3).
 *  - "muyprioritario": "En falta" + condición MUY PRIORITARIO + "Sin gestionar",
 *    que juntos reproducen exactamente lo que cuenta la tarjeta del dashboard
 *    (status 1 + condición 3 + ordered_at NULL), para que el número del
 *    control coincida con el de la tarjeta.
 * El recorte vive en la URL: al apagar un chip se limpia ?filter y al volver
 * desde otra pantalla el control reaparece con el mismo recorte.
 */
export default function useStockControlFilters(items, searchParams, updateParams) {
  const filterFromUrl = searchParams.get("filter");

  // Chips de estado del panel superior. Multi-seleccion: se pueden ver "En
  // falta" y "Sobrestock" a la vez. Vacio = sin filtrar (chip "Total" activo).
  const [statusFilter, setStatusFilter] = React.useState(() => {
    // "muyprioritario" tambien parte de "En falta": los tres chips juntos
    // (estado + condicion + sin gestionar) dan el mismo recorte que la tarjeta.
    if (filterFromUrl === "needorder" || filterFromUrl === "muyprioritario") return [1];
    if (filterFromUrl === "overstock") return [3];
    return [];
  });
  // Chip aparte para los faltantes reponibles todavia sin pedir: no es un
  // estado, es un cruce (status 1 + reponible + sin orden).
  const [unmanagedOnly, setUnmanagedOnly] = React.useState(
    () => filterFromUrl === "muyprioritario"
  );
  // Chips de condicion. Se cruzan con los de estado (AND): "En falta" +
  // "MUY PRIORITARIO" muestra los faltantes muy prioritarios.
  const [conditionFilter, setConditionFilter] = React.useState(() =>
    filterFromUrl === "muyprioritario" ? [CONDITION.MUY_PRIORITARIO] : []
  );

  // Al tocar cualquier chip se limpia ?filter de la URL: si se llego desde el
  // dashboard con "needorder", ese parametro ya cumplio su funcion (encender
  // "En falta") y dejarlo haria que un refresh reviviera un filtro que el
  // usuario acaba de cambiar a mano.
  const dropFilterParam = React.useCallback(() => {
    if (!searchParams.get("filter")) return;
    updateParams({ filter: null }, { replace: true });
  }, [searchParams, updateParams]);

  const toggleStatusFilter = React.useCallback(
    (statusId) => {
      setStatusFilter((prev) => {
        const next = prev.includes(statusId)
          ? prev.filter((s) => s !== statusId)
          : [...prev, statusId];
        // "Sin gestionar" ya implica "En falta". Cruzarlo con Optimo o
        // Sobrestock daria siempre 0 filas, asi que al elegir un estado que no
        // sea el 1 se apaga, en vez de dejar la tabla vacia sin explicacion.
        if (next.some((sid) => sid !== 1)) setUnmanagedOnly(false);
        return next;
      });
      dropFilterParam();
    },
    [dropFilterParam]
  );

  const toggleConditionFilter = React.useCallback(
    (conditionId) => {
      setConditionFilter((prev) =>
        prev.includes(conditionId) ? prev.filter((c) => c !== conditionId) : [...prev, conditionId]
      );
      // No apaga "Sin gestionar": condicion y sin-gestionar se cruzan sin
      // contradecirse ("los PRIORITARIOS que faltan por pedir").
      dropFilterParam();
    },
    [dropFilterParam]
  );

  const toggleUnmanaged = React.useCallback(() => {
    setUnmanagedOnly((prev) => {
      // Al encenderlo se sueltan los estados que lo contradicen
      // (ya implica "En falta"); la condicion elegida se respeta.
      if (!prev) setStatusFilter((sf) => sf.filter((sid) => sid === 1));
      return !prev;
    });
    dropFilterParam();
  }, [dropFilterParam]);

  const clearAllFilters = React.useCallback(() => {
    setStatusFilter([]);
    setConditionFilter([]);
    setUnmanagedOnly(false);
    dropFilterParam();
  }, [dropFilterParam]);

  const noFiltersActive =
    statusFilter.length === 0 && conditionFilter.length === 0 && !unmanagedOnly;

  // Filas visibles en la tabla del control. La selección para órdenes sigue
  // basada en `items` completo (isOrderable), así que el filtro es solo de
  // visualización. Los filtros de llegada del dashboard ya vienen traducidos a
  // chips, asi que este cruce es el unico camino de filtrado y lo que se ve
  // siempre coincide con los chips encendidos.
  const visibleItems = React.useMemo(() => {
    // Los tres criterios se cruzan con AND y ninguno corta antes que los otros:
    // "Sin gestionar" es un criterio mas, no un modo aparte. Cuando cortaba
    // (return propio) ignoraba la condicion elegida y mostraba items que el
    // chip encendido decia estar excluyendo.
    // Un grupo sin chips no filtra.
    return items.filter(
      (i) =>
        (statusFilter.length === 0 || statusFilter.includes(i.stockStatusId)) &&
        (conditionFilter.length === 0 || conditionFilter.includes(i.conditionId)) &&
        (!unmanagedOnly || isUnmanaged(i))
    );
  }, [items, statusFilter, conditionFilter, unmanagedOnly]);

  // Condiciones presentes en ESTE control, con su conteo. Se poblan dinamicamente
  // y no desde la tabla `conditions`: existen 4 condiciones pero ningun control
  // usa mas de 2 (medido: 20 de 21 controles usan 2, uno usa 1), asi que las
  // fijas dejarian siempre chips en cero que ademas vacian la tabla al tocarlos.
  const conditionOptions = React.useMemo(() => {
    const counts = new Map();
    items.forEach((i) => {
      if (!i.conditionId) return;
      const prev = counts.get(i.conditionId);
      counts.set(i.conditionId, {
        id: i.conditionId,
        name: i.conditionName || `Condición ${i.conditionId}`,
        count: (prev?.count || 0) + 1,
      });
    });
    // Orden por id: ESTANDAR, PRIORITARIO, MUY PRIORITARIO, NUEVA MARCA.
    return [...counts.values()].sort((a, b) => a.id - b.id);
  }, [items]);

  // Red de seguridad del filtro de llegada: si se llego con
  // ?filter=muyprioritario a un control que NO tiene ningun item de esa
  // condicion, el chip no existe (se dibujan solo las condiciones presentes) y
  // la tabla quedaria vacia sin nada que apagar. En ese caso se suelta la
  // condicion y quedan los otros dos chips, que si estan a la vista.
  React.useEffect(() => {
    if (conditionOptions.length === 0) return; // items aun sin cargar
    setConditionFilter((prev) => {
      const next = prev.filter((id) => conditionOptions.some((o) => o.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [conditionOptions]);

  return {
    statusFilter,
    conditionFilter,
    unmanagedOnly,
    noFiltersActive,
    visibleItems,
    conditionOptions,
    toggleStatusFilter,
    toggleConditionFilter,
    toggleUnmanaged,
    clearAllFilters,
  };
}
