import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Autocomplete from "@mui/material/Autocomplete";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { DataGrid, GridActionsCellItem } from "@mui/x-data-grid";
import { dataGridSx, dataGridLoadingSlotProps } from "./dataGridStyles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import { useSearchParams } from "react-router";
import useNotifications from "../hooks/useNotifications/useNotifications";
import { useDialogs } from "../hooks/useDialogs/useDialogs";
import {
  getBrandTrials, createBrandTrial, updateBrandTrial, decideBrandTrial, deleteBrandTrial,
  getTrialDisplayStatus, getTrialStatusColor,
} from "../data/brandTrials";
import { getBrands, getCategories } from "../data/catalogs";
import { getBranchesList } from "../data/branches";
import PageContainer from "./PageContainer";
import ActionButton from "./ActionButton";

const formatDate = (d) => (d ? new Date(d).toLocaleDateString("es-ES") : "");
const formatCurrency = (v) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v || 0);
// Fecha YYYY-MM-DD para inputs type=date (sin desfase de zona horaria).
const toInputDate = (d) => (d ? String(d).slice(0, 10) : "");
const todayInput = () => new Date().toISOString().slice(0, 10);

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "due", label: "A evaluar (vencidas)" },
  { value: "en_prueba", label: "En prueba" },
  { value: "incorporada", label: "Incorporadas" },
  { value: "descartada", label: "Descartadas" },
];

const emptyForm = {
  brand: null, branch: null, category: null,
  startDate: todayInput(), endDate: "",
  sampleQty: "",
};

export default function BrandTrialList() {
  const notifications = useNotifications();
  const dialogs = useDialogs();
  const [searchParams] = useSearchParams();
  const initialStatusFilter = searchParams.get("status") || ""; // 'due' = a evaluar

  const [rows, setRows] = React.useState([]);
  const [brands, setBrands] = React.useState([]);
  const [branches, setBranches] = React.useState([]);
  const [categories, setCategories] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [statusFilter, setStatusFilter] = React.useState(initialStatusFilter);

  // Diálogo crear/editar
  const [editing, setEditing] = React.useState(null); // null=cerrado; {}=nuevo; {id,...}=editar
  const [form, setForm] = React.useState(emptyForm);
  const [isSaving, setIsSaving] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [trials, brandsData, branchesData, categoriesData] = await Promise.all([
        getBrandTrials(), getBrands(), getBranchesList(), getCategories(),
      ]);
      setRows(trials);
      setBrands(brandsData);
      setBranches(branchesData);
      setCategories(categoriesData);
    } catch (err) {
      setError(err);
    }
    setIsLoading(false);
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  // Filtro por estado (incluye el derivado 'due' = a evaluar).
  const filteredRows = React.useMemo(() => {
    if (!statusFilter) return rows;
    if (statusFilter === "due") return rows.filter((r) => r.status === "en_prueba" && r.isDue);
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  const openCreate = React.useCallback(() => {
    setForm(emptyForm);
    setEditing({});
  }, []);

  const openEdit = React.useCallback((row) => {
    setForm({
      brand: { id: row.brandId, name: row.brandName },
      branch: { id: row.branchId, name: row.branchName },
      category: row.categoryId ? { id: row.categoryId, name: row.categoryName } : null,
      startDate: toInputDate(row.startDate),
      endDate: toInputDate(row.endDate),
      sampleQty: row.sampleQty ?? "",
    });
    setEditing(row);
  }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const canSave = form.brand && form.branch && form.endDate;

  const handleSave = React.useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const payload = {
        category_id: form.category?.id || null,
        start_date: form.startDate || null,
        end_date: form.endDate,
        sample_qty: form.sampleQty !== "" ? Number(form.sampleQty) : null,
      };
      if (editing?.id) {
        await updateBrandTrial(editing.id, payload);
        notifications.show("Prueba actualizada", { severity: "success", autoHideDuration: 3000 });
      } else {
        await createBrandTrial({ ...payload, brand_id: form.brand.id, branch_id: form.branch.id });
        notifications.show("Prueba creada", { severity: "success", autoHideDuration: 3000 });
      }
      setEditing(null);
      loadData();
    } catch (err) {
      notifications.show(`Error: ${err.message}`, { severity: "error", autoHideDuration: 5000 });
    }
    setIsSaving(false);
  }, [canSave, editing, form, notifications, loadData]);

  // Decisión final: incorporar / descartar. "Incorporar" recuerda configurar la
  // marca manualmente en el stock prioritario de la sucursal.
  const handleDecide = React.useCallback(
    (row, decision) => async () => {
      const isIncorporar = decision === "incorporada";
      const recordatorio = isIncorporar
        ? ` Recordá configurar la marca "${row.brandName}" en el Stock Prioritario de ${row.branchName}.`
        : "";
      const confirmed = await dialogs.confirm(
        `¿Marcar la prueba de "${row.brandName}" (${row.branchName}) como ${isIncorporar ? "INCORPORADA" : "DESCARTADA"}?${recordatorio}`,
        {
          title: isIncorporar ? "Incorporar marca" : "Descartar marca",
          severity: isIncorporar ? "success" : "warning",
          okText: isIncorporar ? "Incorporar" : "Descartar",
          cancelText: "Cancelar",
        }
      );
      if (!confirmed) return;
      try {
        await decideBrandTrial(row.id, decision);
        notifications.show(`Prueba ${isIncorporar ? "incorporada" : "descartada"}`, { severity: "success", autoHideDuration: 3000 });
        loadData();
      } catch (err) {
        notifications.show(`Error: ${err.message}`, { severity: "error", autoHideDuration: 5000 });
      }
    },
    [dialogs, notifications, loadData]
  );

  const handleDelete = React.useCallback(
    (row) => async () => {
      const confirmed = await dialogs.confirm(
        `¿Eliminar la prueba de "${row.brandName}" (${row.branchName})?`,
        { title: "¿Eliminar prueba?", severity: "error", okText: "Eliminar", cancelText: "Cancelar" }
      );
      if (!confirmed) return;
      try {
        await deleteBrandTrial(row.id);
        notifications.show("Prueba eliminada", { severity: "success", autoHideDuration: 3000 });
        loadData();
      } catch (err) {
        notifications.show(`Error: ${err.message}`, { severity: "error", autoHideDuration: 5000 });
      }
    },
    [dialogs, notifications, loadData]
  );

  const columns = React.useMemo(
    () => [
      { field: "brandName", headerName: "Marca", flex: 1, minWidth: 150 },
      { field: "branchName", headerName: "Sucursal", width: 140 },
      {
        field: "categoryName",
        headerName: "Rubro",
        width: 140,
        renderCell: ({ value }) => value || <Typography variant="body2" color="text.disabled">—</Typography>,
      },
      {
        field: "startDate",
        headerName: "Inicio",
        width: 110,
        valueFormatter: (value) => formatDate(value),
      },
      {
        field: "endDate",
        headerName: "Vence",
        width: 110,
        valueFormatter: (value) => formatDate(value),
      },
      {
        field: "sampleQty",
        headerName: "Muestra",
        width: 90,
        renderCell: ({ value }) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Typography variant="body2" color={value != null ? "text.primary" : "text.disabled"}>
              {value != null ? `${value} uds` : "—"}
            </Typography>
          </Box>
        ),
      },
      {
        field: "syncedStock",
        headerName: "Stock actual",
        width: 110,
        type: "number",
        description: "Stock real de la marca en la sucursal/rubro (del sync)",
        renderCell: ({ value }) => (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: "100%" }}>
            <Typography variant="body2">{value} uds</Typography>
          </Box>
        ),
      },
      {
        field: "syncedCost",
        headerName: "Costo unit.",
        width: 120,
        description: "Costo promedio de la marca en la sucursal/rubro (del sync)",
        renderCell: ({ value }) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Typography variant="body2">{value != null ? formatCurrency(value) : "—"}</Typography>
          </Box>
        ),
      },
      {
        field: "status",
        headerName: "Estado",
        width: 130,
        renderCell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Chip label={getTrialDisplayStatus(row)} color={getTrialStatusColor(row)} size="small" />
          </Box>
        ),
      },
      {
        field: "actions",
        type: "actions",
        headerName: "",
        width: 150,
        getActions: ({ row }) => {
          const inProgress = row.status === "en_prueba";
          return [
            ...(inProgress
              ? [
                  <GridActionsCellItem key="incorporar" icon={<CheckCircleIcon color="success" />} label="Incorporar" onClick={handleDecide(row, "incorporada")} />,
                  <GridActionsCellItem key="descartar" icon={<CancelIcon color="warning" />} label="Descartar" onClick={handleDecide(row, "descartada")} />,
                  <GridActionsCellItem key="edit" icon={<EditIcon />} label="Editar" onClick={() => openEdit(row)} showInMenu />,
                ]
              : []),
            <GridActionsCellItem key="delete" icon={<DeleteIcon />} label="Eliminar" onClick={handleDelete(row)} showInMenu />,
          ];
        },
      },
    ],
    [handleDecide, openEdit, handleDelete]
  );

  return (
    <PageContainer
      title="Marcas a prueba"
      breadcrumbs={[{ title: "Marcas a prueba" }]}
      actions={
        <Stack direction="row" spacing={1}>
          <ActionButton variant="primary" icon={<AddIcon />} onClick={openCreate}>
            Nueva prueba
          </ActionButton>
          <ActionButton icon={<RefreshIcon />} onClick={() => !isLoading && loadData()} disabled={isLoading}>
            Actualizar
          </ActionButton>
        </Stack>
      }
    >
      {/* Filtro por estado */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Autocomplete
          size="small"
          options={STATUS_FILTER_OPTIONS}
          getOptionLabel={(o) => o.label}
          value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter) || null}
          onChange={(_, val) => setStatusFilter(val ? val.value : "")}
          isOptionEqualToValue={(o, v) => o.value === v.value}
          renderInput={(params) => <TextField {...params} label="Estado" />}
          sx={{ minWidth: 220 }}
        />
      </Stack>

      {error ? (
        <Alert severity="error">{error.message}</Alert>
      ) : (
        <Box sx={{ flex: 1, width: "100%" }}>
          <DataGrid
            rows={filteredRows}
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

      {/* Diálogo crear/editar */}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>{editing?.id ? "Editar prueba" : "Nueva marca a prueba"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Autocomplete
              options={brands}
              getOptionLabel={(o) => o.name || ""}
              value={form.brand}
              onChange={(_, val) => setField("brand", val)}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              disabled={!!editing?.id} // marca fija al editar
              renderInput={(params) => <TextField {...params} label="Marca" required />}
            />
            <Autocomplete
              options={branches}
              getOptionLabel={(o) => o.name || ""}
              value={form.branch}
              onChange={(_, val) => setField("branch", val)}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              disabled={!!editing?.id} // sucursal fija al editar
              renderInput={(params) => <TextField {...params} label="Sucursal" required />}
            />
            <Autocomplete
              options={categories}
              getOptionLabel={(o) => o.name || ""}
              value={form.category}
              onChange={(_, val) => setField("category", val)}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => <TextField {...params} label="Rubro (opcional)" />}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Inicio"
                type="date"
                value={form.startDate}
                onChange={(e) => setField("startDate", e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="Vence (fin de prueba)"
                type="date"
                value={form.endDate}
                onChange={(e) => setField("endDate", e.target.value)}
                InputLabelProps={{ shrink: true }}
                required
                fullWidth
              />
            </Stack>
            <TextField
              label="Cantidad de muestra"
              type="number"
              value={form.sampleQty}
              onChange={(e) => setField("sampleQty", e.target.value)}
              inputProps={{ min: 0 }}
              fullWidth
            />
            {!editing?.id && (
              <DialogContentText variant="body2">
                La marca probada se gestiona aparte del stock prioritario. Al vencer el período podrás
                incorporarla o descartarla.
              </DialogContentText>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={isSaving || !canSave}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
