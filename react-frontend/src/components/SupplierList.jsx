import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import { DataGrid, GridActionsCellItem } from "@mui/x-data-grid";
import { dataGridSx, dataGridLoadingSlotProps } from "./dataGridStyles";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import SyncIcon from "@mui/icons-material/Sync";
import useNotifications from "../hooks/useNotifications/useNotifications";
import { useDialogs } from "../hooks/useDialogs/useDialogs";
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier, syncCompras } from "../data/suppliers";
import PageContainer from "./PageContainer";

export default function SupplierList() {
  const notifications = useNotifications();
  const dialogs = useDialogs();

  const [rows, setRows] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // Diálogo crear/editar
  const [editing, setEditing] = React.useState(null); // null = cerrado; {} = nuevo; {id,...} = editar
  const [formName, setFormName] = React.useState("");
  const [formContact, setFormContact] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  // Sync de compras
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncReport, setSyncReport] = React.useState(null);

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      setRows(await getSuppliers());
    } catch (err) {
      setError(err);
    }
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = React.useCallback(() => {
    setEditing({});
    setFormName("");
    setFormContact("");
  }, []);

  const openEdit = React.useCallback((row) => {
    setEditing(row);
    setFormName(row.supplier_name || "");
    setFormContact(row.contact_info || "");
  }, []);

  const handleSave = React.useCallback(async () => {
    if (!formName.trim()) return;
    setIsSaving(true);
    try {
      if (editing?.id) {
        await updateSupplier(editing.id, { supplierName: formName.trim(), contactInfo: formContact });
        notifications.show("Proveedor actualizado", { severity: "success", autoHideDuration: 3000 });
      } else {
        await createSupplier({ supplierName: formName.trim(), contactInfo: formContact });
        notifications.show("Proveedor creado", { severity: "success", autoHideDuration: 3000 });
      }
      setEditing(null);
      loadData();
    } catch (err) {
      notifications.show(`Error: ${err.message}`, { severity: "error", autoHideDuration: 5000 });
    }
    setIsSaving(false);
  }, [editing, formName, formContact, notifications, loadData]);

  const handleDelete = React.useCallback(
    (row) => async () => {
      const extra = row.brand_count > 0
        ? ` Se desvincularán ${row.brand_count} marca(s) asociada(s).`
        : "";
      const confirmed = await dialogs.confirm(
        `¿Eliminar el proveedor "${row.supplier_name}"?${extra}`,
        { title: "¿Eliminar proveedor?", severity: "error", okText: "Eliminar", cancelText: "Cancelar" }
      );
      if (!confirmed) return;
      try {
        await deleteSupplier(row.id);
        notifications.show("Proveedor eliminado", { severity: "success", autoHideDuration: 3000 });
        loadData();
      } catch (err) {
        notifications.show(`Error: ${err.message}`, { severity: "error", autoHideDuration: 5000 });
      }
    },
    [dialogs, notifications, loadData]
  );

  const handleSyncCompras = React.useCallback(async () => {
    const confirmed = await dialogs.confirm(
      "Se consultará la API de compras de IDUO para dar de alta proveedores y asociar marcas sin proveedor. No se pisan asignaciones existentes ni se crean marcas nuevas. ¿Continuar?",
      { title: "Sincronizar compras", okText: "Sincronizar", cancelText: "Cancelar" }
    );
    if (!confirmed) return;
    setIsSyncing(true);
    try {
      const report = await syncCompras();
      setSyncReport(report);
      loadData();
    } catch (err) {
      notifications.show(`Error al sincronizar compras: ${err.message}`, {
        severity: "error",
        autoHideDuration: 6000,
      });
    }
    setIsSyncing(false);
  }, [dialogs, notifications, loadData]);

  const columns = React.useMemo(
    () => [
      { field: "id", headerName: "ID", width: 70 },
      { field: "supplier_name", headerName: "Proveedor", flex: 1, minWidth: 200 },
      { field: "contact_info", headerName: "Contacto", flex: 1, minWidth: 200 },
      {
        field: "brand_count",
        headerName: "Marcas",
        width: 110,
        renderCell: ({ value }) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Chip label={Number(value || 0)} size="small" color={value > 0 ? "primary" : "default"} />
          </Box>
        ),
      },
      {
        field: "actions",
        type: "actions",
        headerName: "",
        width: 90,
        getActions: ({ row }) => [
          <GridActionsCellItem key="edit" icon={<EditIcon />} label="Editar" onClick={() => openEdit(row)} />,
          <GridActionsCellItem key="delete" icon={<DeleteIcon />} label="Eliminar" onClick={handleDelete(row)} />,
        ],
      },
    ],
    [openEdit, handleDelete]
  );

  return (
    <PageContainer
      title="Proveedores"
      breadcrumbs={[{ title: "Proveedores" }]}
      actions={
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={isSyncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
            onClick={handleSyncCompras}
            disabled={isSyncing}
          >
            Sincronizar compras
          </Button>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openCreate}>
            Nuevo proveedor
          </Button>
          <Tooltip title="Recargar" enterDelay={1000}>
            <div>
              <IconButton size="small" onClick={() => !isLoading && loadData()}>
                <RefreshIcon />
              </IconButton>
            </div>
          </Tooltip>
        </Stack>
      }
    >
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
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={dataGridSx}
            slotProps={dataGridLoadingSlotProps}
          />
        </Box>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>{editing?.id ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Nombre del proveedor"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              autoFocus
              fullWidth
            />
            <TextField
              label="Contacto / notas"
              value={formContact}
              onChange={(e) => setFormContact(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={isSaving || !formName.trim()}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reporte del sync de compras */}
      <Dialog open={syncReport !== null} onClose={() => setSyncReport(null)} fullWidth maxWidth="sm">
        <DialogTitle>Resultado de la sincronización de compras</DialogTitle>
        <DialogContent dividers>
          {syncReport && (
            <Stack spacing={1.5}>
              {syncReport.aviso && (
                <Alert severity="warning">{syncReport.aviso}</Alert>
              )}
              <Typography variant="body2" color="text.secondary">
                Rango: {syncReport.rango?.desde} a {syncReport.rango?.hasta} · {syncReport.filas} fila(s) procesadas
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip color="success" size="small" label={`Proveedores nuevos: ${syncReport.proveedoresNuevos}`} />
                <Chip color="primary" size="small" label={`Marcas asignadas: ${syncReport.marcasAsignadas?.length || 0}`} />
                <Chip color={syncReport.conflictos?.length ? "warning" : "default"} size="small" label={`Conflictos: ${syncReport.conflictos?.length || 0}`} />
                <Chip size="small" label={`Filas sin marca: ${syncReport.filasSinMarca}`} />
              </Stack>

              {syncReport.marcasAsignadas?.length > 0 && (
                <Box>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2">Marcas asignadas</Typography>
                  {syncReport.marcasAsignadas.map((m, i) => (
                    <Typography key={i} variant="body2">
                      • {m.brand} → {m.supplier}
                    </Typography>
                  ))}
                </Box>
              )}

              {syncReport.conflictos?.length > 0 && (
                <Box>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" color="warning.main">
                    Conflictos (no se modificaron — revisar a mano)
                  </Typography>
                  {syncReport.conflictos.map((c, i) => (
                    <Typography key={i} variant="body2">
                      • {c.brand}: ya tiene proveedor; las compras sugieren “{c.pretendido}”
                    </Typography>
                  ))}
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setSyncReport(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
