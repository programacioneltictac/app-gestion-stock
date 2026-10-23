import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Button from "@mui/material/Button";
import { DataGrid } from "@mui/x-data-grid";
import { dataGridSx, dataGridLoadingSlotProps } from "./dataGridStyles";
import RefreshIcon from "@mui/icons-material/Refresh";
import useNotifications from "../hooks/useNotifications/useNotifications";
import { useDialogs } from "../hooks/useDialogs/useDialogs";
import { getAdminBranches, setBranchActive } from "../data/branches";
import PageContainer from "./PageContainer";
import ActionButton from "./ActionButton";

// Motivo por el que una sucursal activa NO se puede desactivar (null = se puede).
// El servidor valida lo mismo; esto solo deshabilita el botón y lo explica.
function deactivateBlocker(row) {
  if (row.isHub) return "El Nodo Hub no se puede desactivar: lo usan las órdenes internas";
  const blockers = [];
  if (row.activeControls > 0) blockers.push(`${row.activeControls} control(es) activo(s)`);
  if (row.activeOrders > 0) blockers.push(`${row.activeOrders} orden(es) activa(s)`);
  return blockers.length ? `Tiene ${blockers.join(" y ")}` : null;
}

const countCell = ({ value }) => (
  <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
    <Chip label={value} size="small" color={value > 0 ? "primary" : "default"} />
  </Box>
);

export default function BranchList() {
  const notifications = useNotifications();
  const dialogs = useDialogs();

  const [rows, setRows] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [savingId, setSavingId] = React.useState(null);

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      setRows(await getAdminBranches());
    } catch (err) {
      setError(err);
    }
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = React.useCallback(
    async (row) => {
      const activate = !row.isActive;
      const usersNote =
        !activate && row.usersCount > 0
          ? ` Sus ${row.usersCount} usuario(s) employee no van a poder ingresar hasta que se reactive.`
          : "";
      const confirmed = await dialogs.confirm(
        activate
          ? `¿Reactivar la sucursal "${row.name}"? Vuelve a aparecer en el menú, el dashboard y el sync. Su stock se actualiza en el próximo sync.`
          : `¿Desactivar la sucursal "${row.name}"? Deja de aparecer en el menú, el dashboard, el buscador y el sync.${usersNote}`,
        {
          title: activate ? "¿Reactivar sucursal?" : "¿Desactivar sucursal?",
          severity: activate ? "success" : "error",
          okText: activate ? "Reactivar" : "Desactivar",
          cancelText: "Cancelar",
        }
      );
      if (!confirmed) return;
      setSavingId(row.id);
      try {
        await setBranchActive(row.id, activate);
        notifications.show(`Sucursal ${activate ? "reactivada" : "desactivada"}`, {
          severity: "success",
          autoHideDuration: 3000,
        });
        loadData();
      } catch (err) {
        notifications.show(`Error: ${err.message}`, { severity: "error", autoHideDuration: 6000 });
      }
      setSavingId(null);
    },
    [dialogs, notifications, loadData]
  );

  const columns = React.useMemo(
    () => [
      { field: "id", headerName: "ID", width: 70 },
      {
        field: "name",
        headerName: "Sucursal",
        flex: 1,
        minWidth: 180,
        renderCell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, height: "100%" }}>
            {row.name}
            {row.isHub && <Chip label="Hub" size="small" color="secondary" variant="outlined" />}
          </Box>
        ),
      },
      { field: "apiBranchCode", headerName: "Código API", width: 120 },
      {
        field: "isActive",
        headerName: "Estado",
        width: 120,
        renderCell: ({ value }) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Chip
              label={value ? "Activa" : "Inactiva"}
              size="small"
              color={value ? "success" : "default"}
              variant={value ? "filled" : "outlined"}
            />
          </Box>
        ),
      },
      { field: "activeControls", headerName: "Controles activos", width: 150, renderCell: countCell },
      { field: "activeOrders", headerName: "Órdenes activas", width: 140, renderCell: countCell },
      { field: "usersCount", headerName: "Usuarios", width: 110, renderCell: countCell },
      {
        field: "actions",
        headerName: "",
        width: 150,
        sortable: false,
        renderCell: ({ row }) => {
          const blocker = row.isActive ? deactivateBlocker(row) : null;
          return (
            <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
              <Tooltip title={blocker || ""}>
                {/* span: el Tooltip necesita un hijo habilitado para mostrarse */}
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    color={row.isActive ? "error" : "success"}
                    disabled={!!blocker || savingId === row.id}
                    onClick={() => handleToggle(row)}
                  >
                    {row.isActive ? "Desactivar" : "Reactivar"}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          );
        },
      },
    ],
    [handleToggle, savingId]
  );

  return (
    <PageContainer
      title="Sucursales"
      breadcrumbs={[{ title: "Sucursales" }]}
      actions={
        <Stack direction="row" spacing={1}>
          <ActionButton
            icon={<RefreshIcon />}
            onClick={() => !isLoading && loadData()}
            disabled={isLoading}
          >
            Actualizar
          </ActionButton>
        </Stack>
      }
    >
      <Alert severity="info" sx={{ mb: 2 }}>
        Una sucursal desactivada deja de verse en el menú, el dashboard, el buscador y el sync, y
        sus usuarios employee no pueden ingresar. Su historial se conserva. Solo se puede
        desactivar si no tiene controles activos (borrador o completado) ni órdenes activas.
      </Alert>
      {error ? (
        <Alert severity="error">{error.message}</Alert>
      ) : (
        <Box sx={{ flex: 1, width: "100%" }}>
          <DataGrid
            rows={rows}
            columns={columns}
            disableRowSelectionOnClick
            loading={isLoading}
            autoHeight
            hideFooter
            sx={dataGridSx}
            slotProps={dataGridLoadingSlotProps}
          />
        </Box>
      )}
    </PageContainer>
  );
}
