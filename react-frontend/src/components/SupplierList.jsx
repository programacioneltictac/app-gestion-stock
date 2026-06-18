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
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import useNotifications from "../hooks/useNotifications/useNotifications";
import { useDialogs } from "../hooks/useDialogs/useDialogs";
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from "../data/suppliers";
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
    </PageContainer>
  );
}
