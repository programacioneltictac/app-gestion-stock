import * as React from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import { DataGrid } from "@mui/x-data-grid";
import { dataGridSx, dataGridLoadingSlotProps } from "./dataGridStyles";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import useNotifications from "../hooks/useNotifications/useNotifications";
import apiClient from "../services/apiClient";
import { getSuppliers, setBrandSupplier } from "../data/suppliers";
import PageContainer from "./PageContainer";

const INITIAL_PAGE_SIZE = 50;

async function getBrandsList({ page, pageSize, search }) {
  const params = new URLSearchParams({ page: page + 1, pageSize });
  if (search) params.append("search", search);
  return apiClient.get(`/stock/catalogs/brands/list?${params.toString()}`);
}

async function patchIsGroupable(brandId, isGroupable) {
  return apiClient.request(`/stock/catalogs/brands/${brandId}/is-groupable`, {
    method: "PATCH",
    body: JSON.stringify({ isGroupable }),
  });
}

export default function BrandList() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const notifications = useNotifications();

  const [paginationModel, setPaginationModel] = React.useState({
    page: searchParams.get("page") ? Number(searchParams.get("page")) : 0,
    pageSize: searchParams.get("pageSize")
      ? Number(searchParams.get("pageSize"))
      : INITIAL_PAGE_SIZE,
  });
  const [filterModel, setFilterModel] = React.useState(
    searchParams.get("filter")
      ? JSON.parse(searchParams.get("filter") ?? "")
      : { items: [] }
  );

  const [rowsState, setRowsState] = React.useState({ rows: [], rowCount: 0 });
  const [suppliers, setSuppliers] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    getSuppliers().then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  const handlePaginationModelChange = React.useCallback(
    (model) => {
      setPaginationModel(model);
      searchParams.set("page", String(model.page));
      searchParams.set("pageSize", String(model.pageSize));
      const s = searchParams.toString();
      navigate(`${pathname}${s ? "?" : ""}${s}`);
    },
    [navigate, pathname, searchParams]
  );

  const handleFilterModelChange = React.useCallback(
    (model) => {
      setFilterModel(model);
      if (model.items.length > 0 || model.quickFilterValues?.length > 0) {
        searchParams.set("filter", JSON.stringify(model));
      } else {
        searchParams.delete("filter");
      }
      const s = searchParams.toString();
      navigate(`${pathname}${s ? "?" : ""}${s}`);
    },
    [navigate, pathname, searchParams]
  );

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const search = filterModel?.quickFilterValues?.join(" ") || null;
      const result = await getBrandsList({ page: paginationModel.page, pageSize: paginationModel.pageSize, search });
      setRowsState({
        rows: result.brands || [],
        rowCount: result.pagination?.total || 0,
      });
    } catch (err) {
      setError(err);
    }
    setIsLoading(false);
  }, [paginationModel, filterModel]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleIsGroupable = React.useCallback(
    async (brand) => {
      const newValue = !brand.is_groupable;
      // Actualización optimista
      setRowsState((prev) => ({
        ...prev,
        rows: prev.rows.map((r) =>
          r.id === brand.id ? { ...r, is_groupable: newValue } : r
        ),
      }));
      try {
        await patchIsGroupable(brand.id, newValue);
      } catch (err) {
        // Revertir si falla
        setRowsState((prev) => ({
          ...prev,
          rows: prev.rows.map((r) =>
            r.id === brand.id ? { ...r, is_groupable: brand.is_groupable } : r
          ),
        }));
        notifications.show(`Error al actualizar: ${err.message}`, {
          severity: "error",
          autoHideDuration: 3000,
        });
      }
    },
    [notifications]
  );

  const handleChangeSupplier = React.useCallback(
    async (brand, supplier) => {
      const prev = { supplier_id: brand.supplier_id, supplier_name: brand.supplier_name };
      const next = supplier
        ? { supplier_id: supplier.id, supplier_name: supplier.supplier_name }
        : { supplier_id: null, supplier_name: null };
      // Actualización optimista
      setRowsState((s) => ({
        ...s,
        rows: s.rows.map((r) => (r.id === brand.id ? { ...r, ...next } : r)),
      }));
      try {
        await setBrandSupplier(brand.id, next.supplier_id);
      } catch (err) {
        setRowsState((s) => ({
          ...s,
          rows: s.rows.map((r) => (r.id === brand.id ? { ...r, ...prev } : r)),
        }));
        notifications.show(`Error al asignar proveedor: ${err.message}`, {
          severity: "error",
          autoHideDuration: 3000,
        });
      }
    },
    [notifications]
  );

  const columns = React.useMemo(
    () => [
      { field: "id", headerName: "ID", width: 70 },
      { field: "brand_name", headerName: "Marca", flex: 1, minWidth: 200 },
      {
        field: "supplier_id",
        headerName: "Proveedor",
        flex: 1,
        minWidth: 220,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => (
          <Autocomplete
            size="small"
            options={suppliers}
            getOptionLabel={(o) => o.supplier_name || ""}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            value={suppliers.find((s) => s.id === row.supplier_id) || null}
            onChange={(_, val) => handleChangeSupplier(row, val)}
            renderInput={(params) => (
              <TextField {...params} variant="standard" placeholder="Sin proveedor" />
            )}
            sx={{ width: "100%" }}
          />
        ),
      },
      {
        field: "is_groupable",
        headerName: "Agrupable",
        width: 140,
        renderCell: ({ row }) => (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Switch
              size="small"
              checked={row.is_groupable}
              onChange={() => handleToggleIsGroupable(row)}
            />
            <Chip
              label={row.is_groupable ? "Sí" : "No"}
              color={row.is_groupable ? "success" : "default"}
              size="small"
            />
          </Stack>
        ),
      },
    ],
    [handleToggleIsGroupable, handleChangeSupplier, suppliers]
  );

  const initialState = React.useMemo(
    () => ({ pagination: { paginationModel: { pageSize: INITIAL_PAGE_SIZE } } }),
    []
  );

  return (
    <PageContainer
      title="Marcas"
      breadcrumbs={[{ title: "Marcas" }]}
    >
      <Box sx={{ flex: 1, width: "100%" }}>
        {error ? (
          <Alert severity="error">{error.message}</Alert>
        ) : (
          <DataGrid
            rows={rowsState.rows}
            rowCount={rowsState.rowCount}
            columns={columns}
            pagination
            paginationMode="server"
            filterMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={handlePaginationModelChange}
            filterModel={filterModel}
            onFilterModelChange={handleFilterModelChange}
            disableRowSelectionOnClick
            loading={isLoading}
            initialState={initialState}
            showToolbar
            pageSizeOptions={[25, INITIAL_PAGE_SIZE, 100]}
            sx={dataGridSx}
            slotProps={{
              ...dataGridLoadingSlotProps,
              baseIconButton: { size: "small" },
            }}
          />
        )}
      </Box>
    </PageContainer>
  );
}
