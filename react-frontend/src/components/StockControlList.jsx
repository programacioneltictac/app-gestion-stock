import * as React from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import { DataGrid, GridActionsCellItem } from "@mui/x-data-grid";
import { dataGridClickableSx, dataGridLoadingSlotProps } from "./dataGridStyles";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeleteIcon from "@mui/icons-material/Delete";
import { useParams, useNavigate } from "react-router";
import { useDialogs } from "../hooks/useDialogs/useDialogs";
import useNotifications from "../hooks/useNotifications/useNotifications";
import { useAuth } from "../context/AuthContext";
import {
  getControlHistory,
  deleteMonthlyControl,
  createMonthlyControl,
} from "../data/stock";
import { getCategories } from "../data/catalogs";
import { getBranchesList } from "../data/branches";
import PageContainer from "./PageContainer";

export default function StockControlList() {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const notifications = useNotifications();
  const { hasRole } = useAuth();

  const [controls, setControls] = React.useState([]);
  const [branch, setBranch] = React.useState(null);
  const [categories, setCategories] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // Diálogo de creación: selección de rubro
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState(null);
  const [isCreating, setIsCreating] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const branches = await getBranchesList();
      const currentBranch = branches.find((b) => b.id === Number(branchId));

      if (!currentBranch) {
        throw new Error("Sucursal no encontrada");
      }

      setBranch(currentBranch);

      // El historial ya incluye los controles abiertos (draft) y los completados.
      const [historyData, categoriesData] = await Promise.all([
        getControlHistory(currentBranch.id),
        getCategories(),
      ]);

      setControls(historyData);
      setCategories(categoriesData);
    } catch (loadError) {
      setError(loadError);
    }

    setIsLoading(false);
  }, [branchId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = React.useCallback(() => {
    if (!isLoading) {
      loadData();
    }
  }, [isLoading, loadData]);

  const handleRowClick = React.useCallback(
    ({ row }) => {
      navigate(`/stock-control/${branchId}/control/${row.id}`);
    },
    [navigate, branchId]
  );

  const handleOpenCreate = React.useCallback(() => {
    if (!branch) {
      notifications.show("No se pudo obtener la información de la sucursal", {
        severity: "error",
      });
      return;
    }
    setSelectedCategory(null);
    setCreateOpen(true);
  }, [branch, notifications]);

  const handleConfirmCreate = React.useCallback(async () => {
    if (!branch || !selectedCategory) return;

    try {
      setIsCreating(true);
      const newControl = await createMonthlyControl(branch.id, selectedCategory.id);
      notifications.show(`Control del rubro "${selectedCategory.name}" creado`, {
        severity: "success",
        autoHideDuration: 3000,
      });
      setCreateOpen(false);
      navigate(`/stock-control/${branchId}/control/${newControl.id}`);
    } catch (createError) {
      // 409: ya existe un control abierto de ese rubro.
      notifications.show(`Error al crear control: ${createError.message}`, {
        severity: "error",
        autoHideDuration: 5000,
      });
    } finally {
      setIsCreating(false);
    }
  }, [branch, selectedCategory, branchId, navigate, notifications]);

  const handleRowView = React.useCallback(
    (control) => () => {
      navigate(`/stock-control/${branchId}/control/${control.id}`);
    },
    [navigate, branchId]
  );

  const handleRowDelete = React.useCallback(
    (control) => async () => {
      const confirmed = await dialogs.confirm(
        `¿Deseas eliminar el control del rubro ${control.categoryName}?`,
        {
          title: "¿Eliminar control?",
          severity: "error",
          okText: "Eliminar",
          cancelText: "Cancelar",
        }
      );

      if (confirmed) {
        try {
          await deleteMonthlyControl(control.id);
          notifications.show("Control eliminado exitosamente", {
            severity: "success",
            autoHideDuration: 3000,
          });
          loadData();
        } catch (deleteError) {
          notifications.show(`Error al eliminar: ${deleteError.message}`, {
            severity: "error",
            autoHideDuration: 3000,
          });
        }
      }
    },
    [dialogs, notifications, loadData]
  );

  const getStatusColor = React.useCallback((status) => {
    switch (status) {
      case "draft":
        return "warning";
      case "completed":
        return "success";
      default:
        return "default";
    }
  }, []);

  const columns = React.useMemo(
    () => [
      { field: "id", headerName: "ID", width: 70 },
      { field: "categoryName", headerName: "Rubro", flex: 1, minWidth: 150 },
      {
        field: "status",
        headerName: "Estado",
        width: 120,
        renderCell: (params) => (
          <Chip
            label={params.row.statusName || params.value}
            color={getStatusColor(params.value)}
            size="small"
          />
        ),
      },
      { field: "totalItems", headerName: "Total Items", width: 110 },
      {
        field: "avgCompliance",
        headerName: "Compliance %",
        width: 130,
        renderCell: (params) => {
          const value = params.value ?? 0;
          return `${Number(value).toFixed(1)}%`;
        },
      },
      { field: "needOrderItems", headerName: "Pedidos", width: 100 },
      { field: "optimalItems", headerName: "Óptimo", width: 100 },
      { field: "excessItems", headerName: "Sobrestock", width: 100 },
      {
        field: "createdAt",
        headerName: "Fecha Apertura",
        width: 150,
        valueFormatter: (value) => {
          if (!value) return "";
          return new Date(value).toLocaleDateString("es-ES");
        },
      },
      {
        field: "actions",
        type: "actions",
        headerName: "Acciones",
        width: 100,
        getActions: ({ row }) => [
          <GridActionsCellItem
            key="view-item"
            icon={<VisibilityIcon />}
            label="Ver"
            onClick={handleRowView(row)}
          />,
          <GridActionsCellItem
            key="delete-item"
            icon={<DeleteIcon />}
            label="Eliminar"
            onClick={handleRowDelete(row)}
            disabled={row.status === "completed" && !hasRole("admin")}
          />,
        ],
      },
    ],
    [handleRowView, handleRowDelete, getStatusColor, hasRole]
  );

  const pageTitle = branch
    ? `Controles de Stock - ${branch.name}`
    : "Controles de Stock";

  return (
    <PageContainer
      title={pageTitle}
      breadcrumbs={[
        { title: "Control de Stock", href: `/stock-control/${branchId}` },
        { title: branch?.name || "Cargando..." },
      ]}
      actions={
        <Stack direction="row" alignItems="center" spacing={1}>
          <Tooltip title="Recargar datos" placement="right" enterDelay={1000}>
            <div>
              <IconButton
                size="small"
                aria-label="refresh"
                onClick={handleRefresh}
              >
                <RefreshIcon />
              </IconButton>
            </div>
          </Tooltip>
          <Button
            variant="contained"
            onClick={handleOpenCreate}
            startIcon={<AddIcon />}
            disabled={!branch}
          >
            Crear
          </Button>
        </Stack>
      }
    >
      <Box sx={{ flex: 1, width: "100%" }}>
        {error ? (
          <Box sx={{ flexGrow: 1 }}>
            <Alert severity="error">{error.message}</Alert>
          </Box>
        ) : (
          <DataGrid
            rows={controls}
            columns={columns}
            disableRowSelectionOnClick
            onRowClick={handleRowClick}
            loading={isLoading}
            autoHeight
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
            }}
            sx={dataGridClickableSx}
            slotProps={dataGridLoadingSlotProps}
          />
        )}
      </Box>

      {/* Diálogo de creación: elegir rubro */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Crear control de stock</DialogTitle>
        <DialogContent>
          <Autocomplete
            sx={{ mt: 1 }}
            options={categories}
            getOptionLabel={(o) => o.name || ""}
            value={selectedCategory}
            onChange={(_, val) => setSelectedCategory(val)}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(params) => (
              <TextField {...params} label="Rubro" placeholder="Elegí un rubro..." autoFocus />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} color="inherit">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmCreate}
            variant="contained"
            disabled={!selectedCategory || isCreating}
          >
            {isCreating ? "Creando..." : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
