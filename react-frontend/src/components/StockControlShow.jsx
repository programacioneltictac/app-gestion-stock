import * as React from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
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
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { useDialogs } from "../hooks/useDialogs/useDialogs";
import useNotifications from "../hooks/useNotifications/useNotifications";
import {
  getStockItems,
  upsertStockItem,
  deleteStockItem,
  completeMonthlyControl,
  discontinueMonthlyControl,
  getOpenOrdersCount,
  getAvailableProducts,
  getConditions,
  getControlById,
  getDiscontinuedProducts,
} from "../data/stock";
import { createOrderFromControl } from "../data/orders";
import { exportStockControlToExcel } from "../utils/stockControlExcel";
import PageContainer from "./PageContainer";
import ActionButton from "./ActionButton";

const STOCK_STATUS_COLOR = { 1: "error", 2: "success", 3: "warning", 4: "warning" };

// Condición 'NUEVA MARCA' (id 4): productos a prueba, NO elegibles para
// reposición (no se pueden seleccionar para generar orden). Espeja la regla
// del backend en Order.createFromControl.
const NON_REPLENISHABLE_CONDITION_ID = 4;

// ¿Este ítem se puede pedir? Debe estar en "Generar Pedido" (1), no haber sido
// ya pedido, y no ser 'NUEVA MARCA'.
const isOrderable = (item) =>
  item.stockStatusId === 1 &&
  !item.orderedAt &&
  item.conditionId !== NON_REPLENISHABLE_CONDITION_ID;

// Etiqueta de la píldora "ya pedido" según el destino de la orden.
const ORDER_DEST_LABELS = {
  hub:      { label: "Pedido a Hub",          color: "info",      tooltip: "Pedido al Nodo Hub (orden interna)" },
  external: { label: "Pedido a proveedor",    color: "secondary", tooltip: "Pedido a proveedor (orden externa)" },
  both:     { label: "Pedido (Hub+proveedor)", color: "primary",  tooltip: "Pedido parcial al Hub y el resto a proveedor" },
  default:  { label: "Pedido",                color: "info",      tooltip: "Ya enviado a una orden de reposición" },
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value || 0);

// Formatea un ISO timestamp a "dd/mm/aaaa hh:mm" en hora local.
function formatSyncDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StockControlShow() {
  const { branchId, controlId } = useParams();
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const notifications = useNotifications();

  const [control, setControl] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [lastSyncAt, setLastSyncAt] = React.useState(null);
  const [availableProducts, setAvailableProducts] = React.useState([]);
  const [conditions, setConditions] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // Inline add/edit form state. editingItemId != null => modo edición de un
  // ítem ya cargado (recupera producto/condición/stock mínimo en el form).
  const [selectedProduct, setSelectedProduct] = React.useState(null);
  const [selectedCondition, setSelectedCondition] = React.useState("");
  const [stockRequire, setStockRequire] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [editingItemId, setEditingItemId] = React.useState(null);

  // Selección de ítems para generar orden parcial
  const [selectionModel, setSelectionModel] = React.useState([]);
  const [isGenerating, setIsGenerating] = React.useState(false);

  // Tab activa: 'control' (la tabla del control) | 'discontinued' (solo lectura).
  // Permite abrir directo en discontinuos via ?tab=discontinued (acceso desde el
  // dashboard, tarjeta de stock discontinuo).
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = React.useState(
    searchParams.get("tab") === "discontinued" ? "discontinued" : "control"
  );
  const [discontinued, setDiscontinued] = React.useState([]);
  const [discLoaded, setDiscLoaded] = React.useState(false);
  const [isLoadingDisc, setIsLoadingDisc] = React.useState(false);

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

  const [isExporting, setIsExporting] = React.useState(false);

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

  const handleChangeTab = React.useCallback((_, val) => {
    setActiveTab(val);
    if (val === "discontinued" && !discLoaded) loadDiscontinued();
  }, [discLoaded, loadDiscontinued]);

  // Si se entró directo en la tab de discontinuos (?tab=discontinued), dispara la
  // carga lazy una vez al montar.
  React.useEffect(() => {
    if (activeTab === "discontinued" && !discLoaded) loadDiscontinued();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = React.useCallback(() => {
    navigate(`/stock-control/${branchId}`);
  }, [navigate, branchId]);

  // Descarga el control completo a un .xlsx con dos hojas (Control + Discontinuos)
  // en el mismo libro. Si los discontinuos aún no se cargaron (no se entró a la
  // tab), se traen on-demand para que el libro salga completo.
  const handleExportExcel = React.useCallback(async () => {
    setIsExporting(true);
    try {
      const discData = discLoaded ? discontinued : await loadDiscontinued();
      await exportStockControlToExcel(control, items, discData);
    } catch (err) {
      notifications.show(`Error al exportar: ${err.message}`, {
        severity: "error",
        autoHideDuration: 4000,
      });
    }
    setIsExporting(false);
  }, [control, items, discontinued, discLoaded, loadDiscontinued, notifications]);

  const handleUpsertItem = React.useCallback(async () => {
    if (!selectedProduct || stockRequire === "" || Number(stockRequire) < 0) return;

    setIsSaving(true);
    try {
      await upsertStockItem(Number(controlId), selectedProduct.ref, Number(stockRequire), selectedCondition || null);
      // Si era un producto del catálogo global, ahora ya existe en la sucursal:
      // recargamos el catálogo para que pase a la lista local.
      const [itemsData, productsData] = await Promise.all([
        getStockItems(Number(controlId)),
        selectedProduct.isGlobal ? getAvailableProducts(Number(branchId), control.categoryId) : Promise.resolve(null),
      ]);
      setItems(itemsData.items);
      setLastSyncAt(itemsData.lastSyncAt);
      if (productsData) setAvailableProducts(productsData);
      setSelectedProduct(null);
      setSelectedCondition("");
      setStockRequire("");
      setEditingItemId(null);
    } catch (err) {
      notifications.show(`Error al guardar: ${err.message}`, {
        severity: "error",
        autoHideDuration: 4000,
      });
    }
    setIsSaving(false);
  }, [selectedProduct, stockRequire, selectedCondition, controlId, branchId, control, notifications]);

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

  const handleCancelEdit = React.useCallback(() => {
    setEditingItemId(null);
    setSelectedProduct(null);
    setSelectedCondition("");
    setStockRequire("");
  }, []);

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
          setItems((prev) => prev.filter((i) => i.id !== item.id));
        } catch (err) {
          notifications.show(`Error al eliminar: ${err.message}`, {
            severity: "error",
            autoHideDuration: 4000,
          });
        }
      }
    },
    [dialogs, notifications]
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
  const orderableIds = React.useMemo(
    () => items.filter(isOrderable).map((i) => i.id),
    [items]
  );

  const handleSelectAllOrderable = React.useCallback(() => {
    setSelectionModel(orderableIds);
  }, [orderableIds]);

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
            {row.conditionId === NON_REPLENISHABLE_CONDITION_ID &&
              row.stockStatusId === 1 &&
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
          if (control?.status !== "draft") return [];
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
    [control, handleDeleteItem, handleEditItem]
  );

  // Columnas de la tabla de discontinuos (solo lectura): Producto, Rubro,
  // Stock, Costo unit., Total valorizado (= stock * costo unit.).
  const discontinuedColumns = React.useMemo(
    () => [
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
    ],
    []
  );

  const stats = React.useMemo(() => {
    const total = items.length;
    const needOrder = items.filter((i) => i.stockStatusId === 1).length;
    const optimal = items.filter((i) => i.stockStatusId === 2).length;
    const excess = items.filter((i) => i.stockStatusId === 3).length;
    const avg =
      total > 0 ? items.reduce((sum, i) => sum + (Number(i.compliance) || 0), 0) / total : 0;
    return { total, needOrder, optimal, excess, avg };
  }, [items]);

  const canAdd =
    control?.status === "draft" && selectedProduct && stockRequire !== "" && Number(stockRequire) >= 0;

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
          {control?.status === "draft" && (
            <ActionButton
              variant="primary"
              color="success"
              icon={<CheckCircleIcon />}
              onClick={handleCompleteControl}
            >
              Completar
            </ActionButton>
          )}
          {control?.status === "completed" && (
            <ActionButton
              variant="secondary"
              icon={<ArchiveIcon />}
              onClick={handleDiscontinueControl}
            >
              Discontinuar
            </ActionButton>
          )}
          {control && control.status !== "discontinued" && orderableIds.length > 0 && (
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
      {/* Stats bar */}
      {control && (
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
          <Typography variant="body2">Total: <strong>{stats.total}</strong></Typography>
          <Typography variant="body2" color="error.main">Pedido: <strong>{stats.needOrder}</strong></Typography>
          <Typography variant="body2" color="success.main">Óptimo: <strong>{stats.optimal}</strong></Typography>
          <Typography variant="body2" color="warning.main">Sobrestock: <strong>{stats.excess}</strong></Typography>
          <Typography variant="body2">Compliance: <strong>{stats.avg.toFixed(1)}%</strong></Typography>
          {formatSyncDate(lastSyncAt) && (
            <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
              Última sync: <strong>{formatSyncDate(lastSyncAt)}</strong>
            </Typography>
          )}
        </Stack>
      )}

      {/* Tabs: control (tabla editable) vs discontinuos (sobrante, solo lectura) */}
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
      </Tabs>

      {activeTab === "discontinued" ? (
        <Box sx={{ flex: 1, width: "100%" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Productos con stock de este rubro que NO están en el control (sobrante /
            stock a discontinuar). Solo visualización.
          </Typography>
          <DataGrid
            rows={discontinued}
            columns={discontinuedColumns}
            disableRowSelectionOnClick
            loading={isLoadingDisc}
            autoHeight
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={dataGridSx}
          />
        </Box>
      ) : (
        <>
      {/* Inline add form — only visible in draft */}
      {control?.status === "draft" && (
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
      )}

      {/* Barra de selección para órdenes parciales */}
      {control && orderableIds.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
          <Typography variant="body2" color="text.secondary">
            {selectionModel.length > 0
              ? `${selectionModel.length} ítem(s) seleccionado(s) para pedir`
              : `${orderableIds.length} ítem(s) pendiente(s) de pedir`}
          </Typography>
          <Button size="small" onClick={handleSelectAllOrderable}>
            Seleccionar todos los pendientes
          </Button>
          {selectionModel.length > 0 && (
            <Button size="small" color="inherit" onClick={() => setSelectionModel([])}>
              Limpiar selección
            </Button>
          )}
        </Stack>
      )}

      {error ? (
        <Alert severity="error">{error.message}</Alert>
      ) : (
        <Box sx={{ flex: 1, width: "100%" }}>
          <DataGrid
            rows={items}
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
