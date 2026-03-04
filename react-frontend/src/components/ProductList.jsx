import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import { DataGrid, gridClasses } from "@mui/x-data-grid";
import SyncIcon from "@mui/icons-material/Sync";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import useNotifications from "../hooks/useNotifications/useNotifications";
import { getMany as getProducts, syncAll } from "../data/products";
import PageContainer from "./PageContainer";

const INITIAL_PAGE_SIZE = 50;

export default function ProductList() {
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
  const [sortModel, setSortModel] = React.useState(
    searchParams.get("sort") ? JSON.parse(searchParams.get("sort") ?? "") : []
  );

  const [rowsState, setRowsState] = React.useState({ rows: [], rowCount: 0 });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [error, setError] = React.useState(null);

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

  const handleSortModelChange = React.useCallback(
    (model) => {
      setSortModel(model);
      if (model.length > 0) {
        searchParams.set("sort", JSON.stringify(model));
      } else {
        searchParams.delete("sort");
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
      const listData = await getProducts({ paginationModel, sortModel, filterModel });
      setRowsState({
        rows: listData.products || [],
        rowCount: listData.total || 0,
      });
    } catch (listDataError) {
      setError(listDataError);
    }
    setIsLoading(false);
  }, [paginationModel, sortModel, filterModel]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = React.useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await syncAll();
      const total = result.results?.reduce((acc, r) => acc + (r.synced || 0), 0) ?? 0;
      notifications.show(`Sincronización completada. ${total} productos procesados.`, {
        severity: "success",
        autoHideDuration: 4000,
      });
      loadData();
    } catch (err) {
      notifications.show(`Error en sincronización: ${err.message}`, {
        severity: "error",
        autoHideDuration: 4000,
      });
    }
    setIsSyncing(false);
  }, [notifications, loadData]);

  const columns = React.useMemo(
    () => [
      { field: "id", headerName: "ID", width: 70 },
      { field: "name", headerName: "Nombre", flex: 1, minWidth: 200 },
      { field: "code", headerName: "Código", width: 120 },
      { field: "category_name", headerName: "Categoría", width: 150 },
      {
        field: "is_grouped",
        headerName: "Agrupado",
        width: 110,
        renderCell: ({ row }) => (
          <Chip
            label={row.is_grouped ? "Sí" : "No"}
            color={row.is_grouped ? "success" : "default"}
            size="small"
          />
        ),
      },
    ],
    []
  );

  const initialState = React.useMemo(
    () => ({ pagination: { paginationModel: { pageSize: INITIAL_PAGE_SIZE } } }),
    []
  );

  return (
    <PageContainer
      title="Productos"
      breadcrumbs={[{ title: "Productos" }]}
      actions={
        <Button
          variant="contained"
          startIcon={isSyncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? "Sincronizando..." : "Sincronizar"}
        </Button>
      }
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
            sortingMode="server"
            filterMode="server"
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={handlePaginationModelChange}
            sortModel={sortModel}
            onSortModelChange={handleSortModelChange}
            filterModel={filterModel}
            onFilterModelChange={handleFilterModelChange}
            disableRowSelectionOnClick
            loading={isLoading}
            initialState={initialState}
            showToolbar
            pageSizeOptions={[25, INITIAL_PAGE_SIZE, 100, 200]}
            sx={{
              [`& .${gridClasses.columnHeader}, & .${gridClasses.cell}`]: {
                outline: "transparent",
              },
              [`& .${gridClasses.columnHeader}:focus-within, & .${gridClasses.cell}:focus-within`]: {
                outline: "none",
              },
            }}
            slotProps={{
              loadingOverlay: {
                variant: "circular-progress",
                noRowsVariant: "circular-progress",
              },
              baseIconButton: { size: "small" },
            }}
          />
        )}
      </Box>
    </PageContainer>
  );
}
