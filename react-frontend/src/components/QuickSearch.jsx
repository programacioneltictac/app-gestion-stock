import * as React from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import StoreIcon from "@mui/icons-material/Store";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import { useSearchParams } from "react-router";
import { searchStock, getProductOptions, getSupplierOptions } from "../data/search";
import PageContainer from "./PageContainer";

// Mismo criterio de color que la pantalla de control (StockControlShow).
const STOCK_STATUS_COLOR = { 1: "error", 2: "success", 3: "warning" };
// stock_status_name viene crudo de la BD ('generar_pedido'); aca se hace legible.
const STOCK_STATUS_LABEL = {
  1: "Generar Pedido",
  2: "Stock Óptimo",
  3: "Sobrestock",
};

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR");
};

export default function QuickSearch() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Opciones de los desplegables
  const [supplierOptions, setSupplierOptions] = React.useState([]);
  const [productOptions, setProductOptions] = React.useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = React.useState(false);

  // Seleccion actual del encabezado. Ambos Autocomplete son freeSolo: el valor
  // puede ser un objeto {id,label} (elegido de la lista) o un string (tipeado).
  const [supplier, setSupplier] = React.useState(null);
  const [product, setProduct] = React.useState(null);
  const [productInput, setProductInput] = React.useState("");

  const [results, setResults] = React.useState(null); // null = todavia no se busco
  const [isSearching, setIsSearching] = React.useState(false);
  const [error, setError] = React.useState(null);

  // Proveedores: son pocos, se cargan una vez al montar.
  React.useEffect(() => {
    getSupplierOptions()
      .then(setSupplierOptions)
      .catch(() => setSupplierOptions([]));
  }, []);

  // Productos: se buscan contra el backend con debounce mientras se tipea.
  React.useEffect(() => {
    const term = productInput.trim();
    if (term.length < 2) {
      setProductOptions([]);
      return undefined;
    }
    setIsLoadingProducts(true);
    const timer = setTimeout(() => {
      getProductOptions(term)
        .then(setProductOptions)
        .catch(() => setProductOptions([]))
        .finally(() => setIsLoadingProducts(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [productInput]);

  // Ejecuta la busqueda. Los criterios viven en la URL, para que el "Volver"
  // del navegador y un refresh conserven el resultado (mismo patron que /orders).
  const runSearch = React.useCallback(async ({ supplierId, productStockId, q }) => {
    if (!supplierId && !productStockId && !q) {
      setError("Indicá al menos un producto o un proveedor para buscar.");
      setResults(null);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      setResults(await searchStock({ supplierId, productStockId, q }));
    } catch (e) {
      setError(e.message || "Error al buscar");
      setResults(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Rehidratar desde la URL: al montar, y en cada cambio de la query string.
  const appliedRef = React.useRef(null);
  React.useEffect(() => {
    const key = searchParams.toString();
    if (appliedRef.current === key) return;
    appliedRef.current = key;

    const supplierId = searchParams.get("supplier");
    const productStockId = searchParams.get("product");
    const q = searchParams.get("q");
    if (!supplierId && !productStockId && !q) {
      setResults(null);
      return;
    }
    // Reponer los campos del encabezado con lo que dice la URL.
    if (supplierId) {
      const found = supplierOptions.find((s) => String(s.id) === String(supplierId));
      if (found) setSupplier(found);
    }
    if (q && !productStockId) {
      setProduct(q);
      setProductInput(q);
    }
    runSearch({
      supplierId: supplierId ? Number(supplierId) : null,
      productStockId: productStockId ? Number(productStockId) : null,
      q: q || null,
    });
  }, [searchParams, supplierOptions, runSearch]);

  const handleSearch = () => {
    const params = new URLSearchParams();
    const supplierId = supplier && typeof supplier === "object" ? supplier.id : null;
    if (supplierId) params.set("supplier", String(supplierId));

    if (product && typeof product === "object") {
      // Elegido del desplegable: se busca por NOMBRE, no por el id de la fila,
      // porque ese id es de UNA sucursal y aca interesan todas.
      params.set("q", product.label);
    } else {
      const typed = (typeof product === "string" ? product : productInput).trim();
      if (typed) params.set("q", typed);
    }

    if (!params.toString()) {
      setError("Indicá al menos un producto o un proveedor para buscar.");
      setResults(null);
      return;
    }
    setSearchParams(params);
  };

  const handleClear = () => {
    setSupplier(null);
    setProduct(null);
    setProductInput("");
    setResults(null);
    setError(null);
    setSearchParams(new URLSearchParams());
  };

  const hasSearched = results !== null;

  return (
    <PageContainer title="Búsqueda rápida" breadcrumbs={[{ title: "Búsqueda rápida" }]}>
      <Stack spacing={2}>
        {/* ============ ENCABEZADO / PANEL DE BUSQUEDA ============ */}
        <Paper sx={{ p: 2 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", md: "center" }}
          >
            <Autocomplete
              freeSolo
              sx={{ flex: 1, minWidth: 220 }}
              options={productOptions}
              value={product}
              onChange={(_, v) => setProduct(v)}
              inputValue={productInput}
              onInputChange={(_, v) => setProductInput(v)}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.label || "")}
              isOptionEqualToValue={(o, v) => o.id === v?.id}
              loading={isLoadingProducts}
              filterOptions={(x) => x}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Producto"
                  placeholder="Seleccionar o escribir…"
                  size="small"
                  slotProps={{
                    input: {
                      ...params.InputProps,
                      endAdornment: (
                        <React.Fragment>
                          {isLoadingProducts ? <CircularProgress size={16} /> : null}
                          {params.InputProps.endAdornment}
                        </React.Fragment>
                      ),
                    },
                  }}
                />
              )}
            />

            <Autocomplete
              sx={{ flex: 1, minWidth: 220 }}
              options={supplierOptions}
              value={supplier}
              onChange={(_, v) => setSupplier(v)}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.label || "")}
              isOptionEqualToValue={(o, v) => o.id === v?.id}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              renderInput={(params) => (
                <TextField {...params} label="Proveedor" placeholder="Seleccionar…" size="small" />
              )}
            />

            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={handleSearch}
                disabled={isSearching}
              >
                Buscar
              </Button>
              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={handleClear}
                disabled={isSearching}
              >
                Limpiar
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {error && <Alert severity="error">{error}</Alert>}

        {results?.truncated && (
          <Alert severity="warning">
            La búsqueda devolvió demasiados resultados y se muestra solo una parte. Afiná los
            filtros para ver el detalle completo.
          </Alert>
        )}

        {/* ============ PANEL DE RESULTADOS ============ */}
        {isSearching && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {!isSearching && !hasSearched && !error && (
          <Paper sx={{ p: 6, textAlign: "center" }}>
            <SearchIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography color="text.secondary">
              Elegí un producto o un proveedor y tocá <strong>Buscar</strong>.
            </Typography>
          </Paper>
        )}

        {!isSearching && hasSearched && results.branches.length === 0 && (
          <Alert severity="info">
            No se encontraron coincidencias entre los productos que están bajo control. Esta
            pantalla solo muestra productos incluidos en algún control de stock, así que puede
            haber mercadería no listada acá.
          </Alert>
        )}

        {!isSearching &&
          hasSearched &&
          results.branches.map((branch) => (
            <Paper key={branch.branchId} sx={{ overflow: "hidden" }}>
              {/* Encabezado de la sucursal: nombre + totales de un vistazo */}
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ px: 2, py: 1.5, bgcolor: "action.hover", flexWrap: "wrap" }}
              >
                {branch.isHub ? (
                  <WarehouseIcon fontSize="small" color="action" />
                ) : (
                  <StoreIcon fontSize="small" color="action" />
                )}
                <Typography variant="subtitle1" fontWeight={600}>
                  {branch.branchName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  — {branch.items.length} {branch.items.length === 1 ? "ítem" : "ítems"} ·{" "}
                  {branch.totalUnits} u.
                </Typography>
                {branch.needOrderCount > 0 && (
                  <Chip
                    label={`${branch.needOrderCount} a pedir`}
                    color="error"
                    size="small"
                    variant="outlined"
                  />
                )}
              </Stack>

              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Producto</TableCell>
                      <TableCell>Categoría</TableCell>
                      <TableCell>Condición</TableCell>
                      <TableCell align="right">Stock</TableCell>
                      <TableCell align="right">Mínimo</TableCell>
                      <TableCell align="right">Falta</TableCell>
                      <TableCell>Estado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {branch.items.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Tooltip
                            title={
                              item.supplierName
                                ? `Proveedor: ${item.supplierName}`
                                : "Sin proveedor asignado"
                            }
                          >
                            <span>{item.displayName}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell>{item.categoryName}</TableCell>
                        <TableCell>{item.conditionName || "—"}</TableCell>
                        <TableCell align="right">{item.stock}</TableCell>
                        <TableCell align="right">{item.stockRequire}</TableCell>
                        <TableCell align="right">
                          {item.faltante > 0 ? (
                            <Typography
                              component="span"
                              variant="body2"
                              color="error"
                              fontWeight={600}
                            >
                              {item.faltante}
                            </Typography>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip
                            title={`Control ${
                              item.controlStatus === "draft" ? "abierto" : "cerrado"
                            } del ${formatDate(item.controlDate)} · Stock al ${formatDate(
                              item.lastSyncAt
                            )}`}
                          >
                            <Chip
                              label={
                                STOCK_STATUS_LABEL[item.stockStatusId] ||
                                item.stockStatusName ||
                                "—"
                              }
                              color={STOCK_STATUS_COLOR[item.stockStatusId] || "default"}
                              size="small"
                            />
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          ))}
      </Stack>
    </PageContainer>
  );
}
