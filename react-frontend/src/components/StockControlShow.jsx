import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { DataGrid, GridActionsCellItem } from "@mui/x-data-grid";
import { dataGridSx } from "./dataGridStyles";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import ArchiveIcon from "@mui/icons-material/Archive";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { useParams, useNavigate, useLocation } from "react-router";
import { useDialogs } from "../hooks/useDialogs/useDialogs";
import useNotifications from "../hooks/useNotifications/useNotifications";
import useQueryParams from "../hooks/useQueryParams";
import { useAuth } from "../context/AuthContext";
import {
  deleteStockItem,
  completeMonthlyControl,
  discontinueMonthlyControl,
  reopenMonthlyControl,
  getOpenOrdersCount,
} from "../data/stock";
import { createOrderFromControl } from "../data/orders";
import PageContainer from "./PageContainer";
import { CONDITION, STOCK_STATUS } from "../constants";
import ActionButton from "./ActionButton";
import {
  STOCK_STATUS_COLOR,
  ORDER_DEST_LABELS,
  isOrderable,
  isUnmanaged,
} from "./stockControl/stockControlShared";
import useStockControlData from "./stockControl/useStockControlData";
import useStockControlFilters from "./stockControl/useStockControlFilters";
import useStockItemForm from "./stockControl/useStockItemForm";
import StockControlStatsBar from "./stockControl/StockControlStatsBar";
import StockItemForm from "./stockControl/StockItemForm";
import OrderSelectionBar from "./stockControl/OrderSelectionBar";
import ValuedProductsGrid from "./stockControl/ValuedProductsGrid";

export default function StockControlShow() {
  const { branchId, controlId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dialogs = useDialogs();
  const notifications = useNotifications();
  const { hasRole } = useAuth();
  // Crear/cerrar/discontinuar controles, editar sus items y generar ordenes son
  // acciones de admin. El manager consulta el control y gestiona las ordenes ya
  // creadas. Esto solo oculta la UI: quien restringe es requireRole en
  // backend/routes/stock.js y orders.js.
  const isAdmin = hasRole("admin");

  const {
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
  } = useStockControlData(branchId, controlId, notifications);

  const form = useStockItemForm(controlId, reloadItems, notifications);
  const { handleEditItem } = form;

  // Selección de ítems para generar orden parcial
  const [selectionModel, setSelectionModel] = React.useState([]);
  const [isGenerating, setIsGenerating] = React.useState(false);

  // Tab activa: 'control' (la tabla del control) | 'discontinued' | 'promo'
  // (ambas solo lectura). Vive en la URL (?tab=discontinued) para que sobreviva a una recarga y para
  // que el "Volver" de la lista de controles pueda restituirla. También es el
  // acceso directo desde el dashboard (tarjeta de stock discontinuo).
  const [searchParams, updateParams] = useQueryParams();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "discontinued" || tabParam === "promo" ? tabParam : "control";

  // Chips de filtro y filtro de llegada desde el dashboard (?filter=).
  const filters = useStockControlFilters(items, searchParams, updateParams);
  const { visibleItems, noFiltersActive, clearAllFilters } = filters;

  const handleChangeTab = React.useCallback((_, val) => {
    updateParams({ tab: val }, { replace: true });
    if (val === "discontinued" && !discLoaded) loadDiscontinued();
    if (val === "promo" && !promoLoaded) loadPromo();
  }, [discLoaded, loadDiscontinued, promoLoaded, loadPromo, updateParams]);

  // Si se entró directo en la tab de discontinuos o promo (?tab=...), dispara la
  // carga lazy una vez al montar.
  React.useEffect(() => {
    if (activeTab === "discontinued" && !discLoaded) loadDiscontinued();
    if (activeTab === "promo" && !promoLoaded) loadPromo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isExporting, setIsExporting] = React.useState(false);

  // "Volver" respeta de dónde se entró: si el origen mandó un destino explícito
  // (p. ej. el dashboard, vía state), se vuelve ahí; si no, a la lista de
  // controles de la sucursal, que es el camino natural.
  const backTo = location.state?.backTo;
  const handleBack = React.useCallback(() => {
    navigate(backTo || `/stock-control/${branchId}`);
  }, [navigate, backTo, branchId]);

  // Descarga el control completo a un .xlsx con dos hojas (Control + Discontinuos)
  // en el mismo libro. Si los discontinuos aún no se cargaron (no se entró a la
  // tab), se traen on-demand para que el libro salga completo.
  const handleExportExcel = React.useCallback(async () => {
    setIsExporting(true);
    try {
      const discData = discLoaded ? discontinued : await loadDiscontinued();
      // exceljs se descarga recién al exportar: no pesa en la carga inicial.
      const { exportStockControlToExcel } = await import("../utils/stockControlExcel");
      await exportStockControlToExcel(control, items, discData);
    } catch (err) {
      notifications.show(`Error al exportar: ${err.message}`, {
        severity: "error",
        autoHideDuration: 4000,
      });
    }
    setIsExporting(false);
  }, [control, items, discontinued, discLoaded, loadDiscontinued, notifications]);

  const handleDeleteItem = React.useCallback(
    (item) => async () => {
      const confirmed = await dialogs.confirm(
        `¿Deseas eliminar "${item.displayName}" del control?`,
        {
          title: "¿Eliminar ítem?",
          severity: "error",
          okText: "Eliminar",
          cancelText: "Cancelar",
        }
      );
      if (confirmed) {
        try {
          await deleteStockItem(item.id);
          removeItem(item.id);
        } catch (err) {
          notifications.show(`Error al eliminar: ${err.message}`, {
            severity: "error",
            autoHideDuration: 4000,
          });
        }
      }
    },
    [dialogs, notifications, removeItem]
  );

  const handleGenerateOrder = React.useCallback(async () => {
    if (selectionModel.length === 0) return;
    setIsGenerating(true);
    try {
      const orders = await createOrderFromControl(Number(controlId), selectionModel.map(Number));
      // Pueden volver: 1 interna (Hub) + N externas (1 por proveedor, consolidando
      // en la orden abierta del proveedor si ya existía).
      const internals = orders.filter((o) => o.isInternal);
      const externals = orders.filter((o) => !o.isInternal);
      const parts = [];
      if (internals.length) parts.push('1 interna (Hub)');
      if (externals.length) parts.push(`${externals.length} a proveedor(es)`);
      const msg = orders.length > 1
        ? `Se generaron/actualizaron ${orders.length} órdenes [${parts.join(' + ')}] con ${selectionModel.length} ítem(s)`
        : `Orden ${parts[0] || ''} con ${selectionModel.length} ítem(s)`;
      // Acción "Ver orden": preferimos una externa (proveedor); si no, la interna.
      const target = externals[0] || internals[0] || orders[0];
      notifications.show(msg, {
        severity: 'success',
        autoHideDuration: 4000,
        actionText: target ? 'Ver orden' : undefined,
        onAction: target ? () => navigate(`/orders/${target.id}`) : undefined,
      });
      setSelectionModel([]);
      // El control sigue abierto; recargamos para marcar los ítems ya pedidos.
      loadData();
    } catch (err) {
      notifications.show(`Error al crear orden: ${err.message}`, {
        severity: 'error',
        autoHideDuration: 5000,
      });
    }
    setIsGenerating(false);
  }, [controlId, selectionModel, navigate, notifications, loadData]);

  // Ítems pedibles: estado generar_pedido (1) y aún no enviados a una orden.
  // Pendientes de pedir en TODO el control. Se usa para decidir si la barra de
  // seleccion tiene sentido y para avisar cuando el filtro esconde pendientes.
  const orderableIds = React.useMemo(() => items.filter(isOrderable).map((i) => i.id), [items]);

  const handleCompleteControl = React.useCallback(async () => {
    const confirmed = await dialogs.confirm(
      "¿Estás seguro de completar este control? Esta acción no se puede deshacer.",
      {
        title: "¿Completar control?",
        severity: "warning",
        okText: "Completar",
        cancelText: "Cancelar",
      }
    );
    if (confirmed) {
      try {
        await completeMonthlyControl(Number(controlId));
        notifications.show("Control completado exitosamente", {
          severity: "success",
          autoHideDuration: 3000,
        });
        loadData();
      } catch (err) {
        notifications.show(`Error al completar: ${err.message}`, {
          severity: "error",
          autoHideDuration: 3000,
        });
      }
    }
  }, [controlId, dialogs, notifications, loadData]);

  const handleDiscontinueControl = React.useCallback(async () => {
    // Avisar cuántas órdenes abiertas tiene vinculadas (siguen vivas en /orders).
    let openOrders = 0;
    try {
      openOrders = await getOpenOrdersCount(Number(controlId));
    } catch {
      // Si falla el conteo, seguimos sin el aviso (no es bloqueante).
    }

    const ordersMsg =
      openOrders > 0
        ? ` Este control tiene ${openOrders} ${openOrders === 1 ? "orden abierta" : "órdenes abiertas"}; al discontinuar dejará de actualizarse, pero ${openOrders === 1 ? "esa orden sigue" : "esas órdenes siguen"} en /orders.`
        : "";

    const confirmed = await dialogs.confirm(
      `Al discontinuar, el control deja de actualizarse con el stock y no podrá generar órdenes. Esta acción no se puede deshacer.${ordersMsg}`,
      {
        title: "¿Discontinuar control?",
        severity: "warning",
        okText: "Discontinuar",
        cancelText: "Cancelar",
      }
    );
    if (confirmed) {
      try {
        await discontinueMonthlyControl(Number(controlId));
        notifications.show("Control discontinuado", {
          severity: "success",
          autoHideDuration: 3000,
        });
        loadData();
      } catch (err) {
        notifications.show(`Error al discontinuar: ${err.message}`, {
          severity: "error",
          autoHideDuration: 3000,
        });
      }
    }
  }, [controlId, dialogs, notifications, loadData]);

  // Reabre un control completado a borrador para ajustes operativos (solo admin).
  // Reusa el form de edición de siempre; se vuelve a cerrar con "Completar".
  const handleReopenControl = React.useCallback(async () => {
    const confirmed = await dialogs.confirm(
      "Se reabrirá el control para edición (volverá a borrador). Podrás agregar, editar o quitar ítems y luego completarlo de nuevo. Los ítems que ya generaron una orden no se pueden eliminar.",
      {
        title: "¿Reabrir control para editar?",
        severity: "warning",
        okText: "Reabrir",
        cancelText: "Cancelar",
      }
    );
    if (!confirmed) return;
    try {
      await reopenMonthlyControl(Number(controlId));
      notifications.show("Control reabierto para edición", {
        severity: "success",
        autoHideDuration: 3000,
      });
      loadData();
    } catch (err) {
      notifications.show(`Error al reabrir: ${err.message}`, {
        severity: "error",
        autoHideDuration: 3000,
      });
    }
  }, [controlId, dialogs, notifications, loadData]);

  const columns = React.useMemo(
    () => [
      { field: "displayName", headerName: "Producto", flex: 1, minWidth: 200 },
      { field: "categoryName", headerName: "Rubro", width: 130 },
      { field: "conditionName", headerName: "Condición", width: 130 },
      { field: "stockRequire", headerName: "Req.", width: 80, type: "number" },
      { field: "stockCurrent", headerName: "Actual", width: 80, type: "number" },
      // Solo en el control del Hub: unidades reservadas por órdenes internas
      // abiertas de otras sucursales (no mueve stock, es estado derivado).
      ...(control?.isHub
        ? [{
            field: "committed",
            headerName: "Comprom.",
            width: 100,
            type: "number",
            renderCell: ({ value }) => (
              <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
                <Typography sx={{ color: value > 0 ? "warning.main" : "text.disabled" }}>
                  {value > 0 ? `-${value}` : 0}
                </Typography>
              </Box>
            ),
          }]
        : []),
      {
        field: "stockDifference",
        headerName: "Dif.",
        width: 80,
        type: "number",
        // En el Hub, "Dif." descuenta lo comprometido para reflejar el disponible
        // real (stock - requerido - reservado). En el resto, es la dif. cruda.
        valueGetter: (value, row) =>
          control?.isHub ? value - (row.committed || 0) : value,
        renderCell: ({ value }) => {
          const color = value < 0 ? "error.main" : value > 0 ? "success.main" : "text.primary";
          return (
            <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
              <Typography sx={{ color }}>{value}</Typography>
            </Box>
          );
        },
      },
      {
        field: "compliance",
        headerName: "Compliance",
        width: 110,
        renderCell: ({ value }) => `${Number(value).toFixed(1)}%`,
      },
      {
        field: "stockStatusName",
        headerName: "Estado",
        width: 210,
        renderCell: ({ value, row }) => (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ height: "100%" }}>
            <Chip
              label={value}
              color={STOCK_STATUS_COLOR[row.stockStatusId] || "default"}
              size="small"
            />
            {row.orderedAt && (() => {
              const dest = ORDER_DEST_LABELS[row.orderDest] || ORDER_DEST_LABELS.default;
              return (
                <Tooltip title={dest.tooltip}>
                  <Chip label={dest.label} color={dest.color} size="small" variant="outlined" />
                </Tooltip>
              );
            })()}
            {/* 'NUEVA MARCA' a prueba: aclarar por qué no se puede pedir cuando
                está en "Generar Pedido" y aún no fue pedido. */}
            {row.conditionId === CONDITION.NON_REPLENISHABLE &&
              row.stockStatusId === STOCK_STATUS.NEED_ORDER &&
              !row.orderedAt && (
                <Tooltip title="Producto a prueba (NUEVA MARCA): no entra en órdenes de reposición">
                  <Chip label="No reponible" color="default" size="small" variant="outlined" />
                </Tooltip>
              )}
          </Stack>
        ),
      },
      {
        field: "actions",
        type: "actions",
        headerName: "",
        width: 90,
        getActions: ({ row }) => {
          // Editar/borrar items del control es de admin: cargar items no es
          // funcion del manager (backend/routes/stock.js lo exige).
          if (control?.status !== "draft" || !isAdmin) return [];
          // Los ítems ya pedidos (ordered_at) no se editan: su cantidad ya
          // viajó a una orden. Para cambiarlos hay que eliminar el ítem (lo
          // que reabre el pedido) y volver a cargarlo.
          const isOrdered = !!row.orderedAt;
          return [
            <GridActionsCellItem
              key="edit"
              icon={<EditIcon />}
              label={isOrdered ? "No editable: ya pedido" : "Editar"}
              disabled={isOrdered}
              onClick={() => handleEditItem(row)}
            />,
            <GridActionsCellItem
              key="delete"
              icon={<DeleteIcon />}
              label="Eliminar"
              onClick={handleDeleteItem(row)}
            />,
          ];
        },
      },
    ],
    [control, handleDeleteItem, handleEditItem, isAdmin]
  );

  // Pendientes de pedir ENTRE LOS VISIBLES. "Seleccionar todos" usa estos y no
  // los del control entero: con los chips se filtra mucho mas seguido, y
  // seleccionar items ocultos genera ordenes con cosas que no se ven en
  // pantalla. La seleccion en si sigue siendo valida sobre `items` (el filtro
  // es solo de visualizacion), esto acota que se autoselecciona.
  const visibleOrderableIds = React.useMemo(
    () => visibleItems.filter(isOrderable).map((i) => i.id),
    [visibleItems]
  );

  const handleSelectAllOrderable = React.useCallback(() => {
    setSelectionModel(visibleOrderableIds);
  }, [visibleOrderableIds]);

  // Items ya seleccionados que el filtro actual esconde. Si hay, se avisa: son
  // items que entrarian en la orden sin estar a la vista.
  const hiddenSelectedCount = React.useMemo(() => {
    if (!selectionModel.length) return 0;
    const visibleIds = new Set(visibleItems.map((i) => i.id));
    return selectionModel.filter((id) => !visibleIds.has(id)).length;
  }, [selectionModel, visibleItems]);

  const stats = React.useMemo(() => {
    const total = items.length;
    const needOrder = items.filter((i) => i.stockStatusId === STOCK_STATUS.NEED_ORDER).length;
    const optimal = items.filter((i) => i.stockStatusId === STOCK_STATUS.OPTIMAL).length;
    const excess = items.filter((i) => i.stockStatusId === STOCK_STATUS.OVERSTOCK).length;
    // Faltantes reponibles todavía sin pedir (sin chip "Pedido a..."). Es la
    // cifra accionable: cuántos faltantes quedan por gestionar en una orden.
    const unmanaged = items.filter(isUnmanaged).length;
    const avg =
      total > 0 ? items.reduce((sum, i) => sum + (Number(i.compliance) || 0), 0) / total : 0;
    return { total, needOrder, optimal, excess, unmanaged, avg };
  }, [items]);

  const canAdd =
    control?.status === "draft" &&
    form.selectedProduct &&
    form.stockRequire !== "" &&
    Number(form.stockRequire) >= 0;

  return (
    <PageContainer
      title={control ? `${control.branchName} - ${control.categoryName}` : "Stock Prioritario"}
      breadcrumbs={[
        { title: "Stock Prioritario", href: `/stock-control/${branchId}` },
        { title: control?.branchName || "Sucursal" },
        { title: control?.categoryName || "Cargando..." },
      ]}
      actions={
        <Stack direction="row" alignItems="center" spacing={1}>
          <ActionButton icon={<ArrowBackIcon />} onClick={handleBack}>
            Volver
          </ActionButton>
          {control && (
            <ActionButton
              variant="secondary"
              icon={<FileDownloadIcon />}
              loading={isExporting}
              loadingText="Generando..."
              onClick={handleExportExcel}
            >
              Descargar Excel
            </ActionButton>
          )}
          {control?.status === "draft" && isAdmin && (
            <ActionButton
              variant="primary"
              color="success"
              icon={<CheckCircleIcon />}
              onClick={handleCompleteControl}
            >
              Completar
            </ActionButton>
          )}
          {control?.status === "completed" && isAdmin && (
            <ActionButton
              variant="secondary"
              icon={<LockOpenIcon />}
              onClick={handleReopenControl}
            >
              Reabrir para editar
            </ActionButton>
          )}
          {control?.status === "completed" && isAdmin && (
            <ActionButton
              variant="secondary"
              icon={<ArchiveIcon />}
              onClick={handleDiscontinueControl}
            >
              Discontinuar
            </ActionButton>
          )}
          {control && control.status !== "discontinued" && orderableIds.length > 0 && isAdmin && (
            <ActionButton
              variant="primary"
              color="warning"
              icon={<ShoppingCartIcon />}
              loading={isGenerating}
              loadingText="Generando..."
              onClick={handleGenerateOrder}
              disabled={selectionModel.length === 0}
            >
              {`Generar orden (${selectionModel.length})`}
            </ActionButton>
          )}
        </Stack>
      }
    >
      {control && (
        <StockControlStatsBar
          control={control}
          stats={stats}
          lastSyncAt={lastSyncAt}
          filters={filters}
        />
      )}

      {/* Tabs: control (tabla editable) vs discontinuos (sobrante) y promo (solo lectura) */}
      <Tabs
        value={activeTab}
        onChange={handleChangeTab}
        sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab value="control" label="Control" />
        <Tab
          value="discontinued"
          label={discLoaded ? `Discontinuos (${discontinued.length})` : "Discontinuos"}
        />
        <Tab value="promo" label={promoLoaded ? `Promo (${promo.length})` : "Promo"} />
      </Tabs>

      {activeTab === "discontinued" ? (
        <ValuedProductsGrid
          rows={discontinued}
          loading={isLoadingDisc}
          description="Productos con stock de este rubro que NO están en el control (sobrante / stock a discontinuar). Solo visualización."
        />
      ) : activeTab === "promo" ? (
        <ValuedProductsGrid
          rows={promo}
          loading={isLoadingPromo}
          description="Productos PROMO con stock de este rubro. No se reponen ni cuentan como discontinuos. Solo visualización."
        />
      ) : (
        <>
          {/* Inline add form — only visible in draft */}
          {control?.status === "draft" && isAdmin && (
            <StockItemForm
              form={form}
              availableProducts={availableProducts}
              conditions={conditions}
              canAdd={canAdd}
            />
          )}

          {/* Barra de selección para órdenes parciales */}
          {control && orderableIds.length > 0 && (
            <OrderSelectionBar
              selectedCount={selectionModel.length}
              orderableCount={orderableIds.length}
              visibleOrderableCount={visibleOrderableIds.length}
              hiddenSelectedCount={hiddenSelectedCount}
              noFiltersActive={noFiltersActive}
              onSelectAll={handleSelectAllOrderable}
              onClear={() => setSelectionModel([])}
            />
          )}

          {error ? (
            <Alert severity="error">{error.message}</Alert>
          ) : (
            <Box sx={{ flex: 1, width: "100%" }}>
              {/* Los filtros pueden dejar la tabla vacia con chips encendidos (ej.
                  una condicion sin faltantes por gestionar). Sin aviso parece que
                  el control no tiene items o que algo fallo. */}
              {items.length > 0 && visibleItems.length === 0 && (
                <Alert
                  severity="info"
                  sx={{ mb: 1 }}
                  action={
                    <Button color="inherit" size="small" onClick={clearAllFilters}>
                      Limpiar filtros
                    </Button>
                  }
                >
                  Ningún ítem de los {items.length} del control coincide con los filtros elegidos.
                </Alert>
              )}
              <DataGrid
                rows={visibleItems}
                columns={columns}
                checkboxSelection
                disableRowSelectionOnClick
                isRowSelectable={({ row }) => isOrderable(row)}
                rowSelectionModel={selectionModel}
                onRowSelectionModelChange={(model) => setSelectionModel(model)}
                loading={isLoading}
                autoHeight
                pageSizeOptions={[25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                sx={dataGridSx}
              />
            </Box>
          )}
        </>
      )}
    </PageContainer>
  );
}
