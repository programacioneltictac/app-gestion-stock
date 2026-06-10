import * as React from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { DataGrid, GridActionsCellItem } from "@mui/x-data-grid";
import { dataGridSx } from "./dataGridStyles";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import { useParams, useNavigate } from "react-router";
import { useDialogs } from "../hooks/useDialogs/useDialogs";
import useNotifications from "../hooks/useNotifications/useNotifications";
import {
  getStockItems,
  upsertStockItem,
  deleteStockItem,
  completeMonthlyControl,
  getAvailableProducts,
  getConditions,
  getCurrentControl,
} from "../data/stock";
import { createOrderFromControl } from "../data/orders";
import PageContainer from "./PageContainer";

const STOCK_STATUS_COLOR = { 1: "error", 2: "success", 3: "warning", 4: "warning" };

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

  // Inline add form state
  const [selectedProduct, setSelectedProduct] = React.useState(null);
  const [selectedCondition, setSelectedCondition] = React.useState("");
  const [stockRequire, setStockRequire] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [currentData, itemsData, productsData, conditionsData] = await Promise.all([
        getCurrentControl(Number(branchId)),
        getStockItems(Number(controlId)),
        getAvailableProducts(Number(branchId)),
        getConditions(),
      ]);
      setControl(currentData);
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

  const handleBack = React.useCallback(() => {
    navigate(`/stock-control/${branchId}`);
  }, [navigate, branchId]);

  const handleUpsertItem = React.useCallback(async () => {
    if (!selectedProduct || stockRequire === "" || Number(stockRequire) < 0) return;

    setIsSaving(true);
    try {
      await upsertStockItem(Number(controlId), selectedProduct.id, Number(stockRequire), selectedCondition || null);
      // Reload items only (products list stays)
      const itemsData = await getStockItems(Number(controlId));
      setItems(itemsData.items);
      setLastSyncAt(itemsData.lastSyncAt);
      setSelectedProduct(null);
      setSelectedCondition("");
      setStockRequire("");
    } catch (err) {
      notifications.show(`Error al guardar: ${err.message}`, {
        severity: "error",
        autoHideDuration: 4000,
      });
    }
    setIsSaving(false);
  }, [selectedProduct, stockRequire, controlId, notifications]);

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
    try {
      const order = await createOrderFromControl(Number(controlId));
      notifications.show('Orden de reposicion creada exitosamente', {
        severity: 'success',
        autoHideDuration: 3000,
      });
      navigate(`/orders/${order.id}`);
    } catch (err) {
      notifications.show(`Error al crear orden: ${err.message}`, {
        severity: 'error',
        autoHideDuration: 5000,
      });
    }
  }, [controlId, navigate, notifications]);

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

  const columns = React.useMemo(
    () => [
      { field: "displayName", headerName: "Producto", flex: 1, minWidth: 200 },
      { field: "categoryName", headerName: "Rubro", width: 130 },
      { field: "conditionName", headerName: "Condición", width: 130 },
      { field: "stockRequire", headerName: "Req.", width: 80, type: "number" },
      { field: "stockCurrent", headerName: "Actual", width: 80, type: "number" },
      {
        field: "stockDifference",
        headerName: "Dif.",
        width: 80,
        type: "number",
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
        width: 140,
        renderCell: ({ value, row }) => (
          <Chip
            label={value}
            color={STOCK_STATUS_COLOR[row.stockStatusId] || "default"}
            size="small"
          />
        ),
      },
      {
        field: "actions",
        type: "actions",
        headerName: "",
        width: 60,
        getActions: ({ row }) =>
          control?.status === "draft"
            ? [
                <GridActionsCellItem
                  key="delete"
                  icon={<DeleteIcon />}
                  label="Eliminar"
                  onClick={handleDeleteItem(row)}
                />,
              ]
            : [],
      },
    ],
    [control, handleDeleteItem]
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
      title={control ? `${control.branchName} - ${control.period}` : "Control de Stock"}
      breadcrumbs={[
        { title: "Control de Stock", href: `/stock-control/${branchId}` },
        { title: control?.branchName || "Sucursal" },
        { title: control?.period || "Cargando..." },
      ]}
      actions={
        <Stack direction="row" alignItems="center" spacing={1}>
          <Tooltip title="Volver" enterDelay={1000}>
            <IconButton size="small" onClick={handleBack}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          {control?.status === "draft" && (
            <Button
              variant="contained"
              color="success"
              onClick={handleCompleteControl}
              startIcon={<CheckCircleIcon />}
            >
              Completar
            </Button>
          )}
          {control?.status === "completed" && stats.needOrder > 0 && (
            <Button
              variant="outlined"
              color="warning"
              onClick={handleGenerateOrder}
              startIcon={<ShoppingCartIcon />}
            >
              Generar orden ({stats.needOrder})
            </Button>
          )}
        </Stack>
      }
    >
      {/* Stats bar */}
      {control && (
        <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap">
          <Chip
            label={control.statusName}
            color={control.status === "completed" ? "success" : "warning"}
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

      {/* Inline add form — only visible in draft */}
      {control?.status === "draft" && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
          <Autocomplete
            size="small"
            options={availableProducts}
            getOptionLabel={(o) => o.display_name || ""}
            value={selectedProduct}
            onChange={(_, val) => setSelectedProduct(val)}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(params) => (
              <TextField {...params} label="Producto" placeholder="Buscar producto..." />
            )}
            sx={{ minWidth: 300 }}
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
            {isSaving ? "Guardando..." : "Agregar / Actualizar"}
          </Button>
        </Stack>
      )}

      {error ? (
        <Alert severity="error">{error.message}</Alert>
      ) : (
        <Box sx={{ flex: 1, width: "100%" }}>
          <DataGrid
            rows={items}
            columns={columns}
            disableRowSelectionOnClick
            loading={isLoading}
            autoHeight
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={dataGridSx}
          />
        </Box>
      )}
    </PageContainer>
  );
}
