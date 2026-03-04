import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import { DataGrid, GridActionsCellItem, gridClasses } from "@mui/x-data-grid";
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
  getCurrentControl,
  createMonthlyControl,
} from "../data/stock";
import { getBranchesList } from "../data/branches";
import PageContainer from "./PageContainer";

export default function StockControlList() {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const notifications = useNotifications();
  const { hasRole } = useAuth();

  const [controls, setControls] = React.useState([]);
  const [currentControl, setCurrentControl] = React.useState(null);
  const [branch, setBranch] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      // Obtener sucursales y encontrar la actual
      const branches = await getBranchesList();
      const currentBranch = branches.find((b) => b.id === Number(branchId));

      if (!currentBranch) {
        throw new Error("Sucursal no encontrada");
      }

      setBranch(currentBranch);

      // Cargar historial y control actual para esta sucursal específica
      const [historyData, currentData] = await Promise.all([
        getControlHistory(currentBranch.id),
        getCurrentControl(currentBranch.id),
      ]);

      setControls(historyData);
      setCurrentControl(currentData);
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

  const handleCreateClick = React.useCallback(async () => {
    if (!branch) {
      notifications.show("No se pudo obtener la información de la sucursal", {
        severity: "error",
      });
      return;
    }

    try {
      setIsLoading(true);
      const newControl = await createMonthlyControl(branch.id);
      notifications.show("Control mensual creado exitosamente", {
        severity: "success",
        autoHideDuration: 3000,
      });
      navigate(`/stock-control/${branchId}/control/${newControl.id}`);
    } catch (createError) {
      notifications.show(`Error al crear control: ${createError.message}`, {
        severity: "error",
        autoHideDuration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  }, [branch, branchId, navigate, notifications]);

  const handleRowView = React.useCallback(
    (control) => () => {
      navigate(`/stock-control/${branchId}/control/${control.id}`);
    },
    [navigate, branchId]
  );

  const handleRowDelete = React.useCallback(
    (control) => async () => {
      const confirmed = await dialogs.confirm(
        `¿Deseas eliminar el control del período ${control.period}?`,
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
      { field: "branchName", headerName: "Sucursal", flex: 1, minWidth: 150 },
      { field: "period", headerName: "Período", width: 120 },
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
      { field: "excessItems", headerName: "Excedidos", width: 100 },
      {
        field: "createdAt",
        headerName: "Fecha Creación",
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
            onClick={handleCreateClick}
            startIcon={<AddIcon />}
            disabled={!!currentControl}
          >
            {currentControl ? "Ya existe un control activo" : "Crear"}
          </Button>
        </Stack>
      }
    >
      {currentControl && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Tienes un control activo del período {currentControl.period}.{" "}
          <Button
            size="small"
            onClick={() =>
              navigate(
                `/stock-control/${branchId}/control/${currentControl.id}`
              )
            }
          >
            Ver Control Actual
          </Button>
        </Alert>
      )}

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
            sx={{
              [`& .${gridClasses.columnHeader}, & .${gridClasses.cell}`]: {
                outline: "transparent",
              },
              [`& .${gridClasses.columnHeader}:focus-within, & .${gridClasses.cell}:focus-within`]:
                {
                  outline: "none",
                },
              [`& .${gridClasses.row}:hover`]: {
                cursor: "pointer",
              },
            }}
            slotProps={{
              loadingOverlay: {
                variant: "circular-progress",
                noRowsVariant: "circular-progress",
              },
            }}
          />
        )}
      </Box>
    </PageContainer>
  );
}
