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
import { searchStock, getProductOptions, getSupplierOptions, groupByBranch } from "../data/search";
import PageContainer from "./PageContainer";

// Mismo criterio de color que la pantalla de control (StockControlShow).
const STOCK_STATUS_COLOR = { 1: "error", 2: "success", 3: "warning" };
// stock_status_name viene crudo de la BD ('generar_pedido'); aca se hace legible.
const STOCK_STATUS_LABEL = {
  1: "Generar Pedido",
  2: "Stock Óptimo",
  3: "Sobrestock",
};

// Los 3 filtros de la pantalla. Se aplican en el CLIENTE sobre los resultados
// ya traidos: los volumenes son chicos (un proveedor grande son ~60 filas), asi
// que filtrar es instantaneo y no hace falta volver al servidor.
//
// Igual viven en la URL, para que un filtrado se pueda compartir o sobreviva a
// un refresh (mismo criterio que los criterios de busqueda). Ojo: NO deben
// disparar una busqueda nueva -> ver SEARCH_PARAM_KEYS.
const FILTER_DEFS = [
  { key: "estado", label: "Estado", field: "stockStatusId" },
  { key: "categoria", label: "Categoría", field: "categoryName" },
  { key: "condicion", label: "Condición", field: "conditionName" },
];

// Anchos de las columnas de la tabla de resultados.
//
// Cada sucursal se dibuja como una <Table> INDEPENDIENTE, y una tabla HTML
// dimensiona sus columnas segun su propio contenido. Sin anchos fijos, dos
// sucursales con textos de distinto largo quedan con columnas de distinto
// ancho: se ve como si las tablas estuvieran "desalineadas" entre si.
//
// Antes no se notaba porque todas las sucursales solian tener los mismos
// productos (mismo texto mas largo -> mismo ancho). Al filtrar, cada tabla se
// queda con un subconjunto distinto y los anchos se separan. Por eso se fija
// el layout: asi la grilla es identica en todas las sucursales, con o sin
// filtros. La suma da 100%.
const COLUMNS = [
  { key: "producto", label: "Producto", width: "30%", align: "left" },
  { key: "categoria", label: "Categoría", width: "16%", align: "left" },
  { key: "condicion", label: "Condición", width: "16%", align: "left" },
  { key: "stock", label: "Stock", width: "8%", align: "right" },
  { key: "minimo", label: "Mínimo", width: "8%", align: "right" },
  { key: "falta", label: "Falta", width: "8%", align: "right" },
  { key: "estado", label: "Estado", width: "14%", align: "left" },
];

// Recorte con elipsis para las celdas de texto: con tableLayout fijo el
// contenido largo ya no ensancha la columna, asi que hay que decirle como
// desbordar (si no, se monta sobre la celda vecina).
const ELLIPSIS = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

// Ancho minimo para que, en pantallas angostas, las columnas no se aplasten:
// por debajo de esto el TableContainer scrollea en horizontal en vez de
// deformar la grilla.
const TABLE_MIN_WIDTH = 720;

// Parametros que identifican QUE se busca. Solo un cambio en estos re-consulta
// al backend; los de filtro se aplican sobre lo que ya esta en memoria.
const SEARCH_PARAM_KEYS = ["supplier", "product", "q"];

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

  // Rehidratar desde la URL: al montar, y en cada cambio de los criterios de
  // BUSQUEDA. La clave se arma solo con SEARCH_PARAM_KEYS a proposito: tocar un
  // chip de filtro tambien cambia la query string, y si entrara aca dispararia
  // una consulta al backend por cada clic.
  const appliedRef = React.useRef(null);
  React.useEffect(() => {
    const key = SEARCH_PARAM_KEYS.map((k) => `${k}=${searchParams.get(k) || ""}`).join("&");
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

  // ---------- FILTROS (estado / categoria / condicion) ----------

  // Valores activos de cada filtro, leidos de la URL. Multi-valor: ?estado=1,3
  const activeFilters = React.useMemo(() => {
    const out = {};
    FILTER_DEFS.forEach(({ key }) => {
      const raw = searchParams.get(key);
      out[key] = raw ? raw.split(",").filter(Boolean) : [];
    });
    return out;
  }, [searchParams]);

  const hasActiveFilters = FILTER_DEFS.some(({ key }) => activeFilters[key].length > 0);

  // Chips disponibles: SOLO los valores presentes en el resultado actual, con
  // su conteo. Un proveedor suele tocar 2 o 3 categorias, no las 10 del sistema,
  // asi que ofrecer la tabla entera seria ruido (y ofreceria filtros que dejan
  // la pantalla vacia). Se cuenta sobre las filas sin filtrar para que los
  // numeros no bailen a medida que se tilda.
  const filterOptions = React.useMemo(() => {
    const rows = results?.rows || [];
    const out = {};
    FILTER_DEFS.forEach(({ key, field }) => {
      const counts = new Map();
      rows.forEach((row) => {
        const value = row[field];
        if (value === null || value === undefined || value === "") return;
        counts.set(String(value), (counts.get(String(value)) || 0) + 1);
      });
      out[key] = [...counts.entries()].map(([value, count]) => ({ value, count }));
    });
    // El estado se ordena por su id (Generar Pedido primero, que es el que
    // importa); los otros dos, alfabeticamente.
    out.estado.sort((a, b) => Number(a.value) - Number(b.value));
    out.categoria.sort((a, b) => a.value.localeCompare(b.value, "es"));
    out.condicion.sort((a, b) => a.value.localeCompare(b.value, "es"));
    return out;
  }, [results]);

  // Filas que pasan los filtros, reagrupadas por sucursal. Al reagrupar, los
  // totales del encabezado quedan referidos a lo filtrado y las sucursales que
  // se quedan sin items desaparecen solas.
  const visibleBranches = React.useMemo(() => {
    if (!results) return [];
    if (!hasActiveFilters) return results.branches;

    const filtered = results.rows.filter((row) =>
      FILTER_DEFS.every(({ key, field }) => {
        const selected = activeFilters[key];
        if (!selected.length) return true; // filtro sin tildar = no filtra
        return selected.includes(String(row[field]));
      })
    );
    return groupByBranch(filtered);
  }, [results, activeFilters, hasActiveFilters]);

  const visibleCount = React.useMemo(
    () => visibleBranches.reduce((acc, b) => acc + b.items.length, 0),
    [visibleBranches]
  );

  // Tocar un chip agrega/quita ese valor. Se preservan los demas parametros
  // (incluidos los de busqueda) para no perder el resultado en pantalla.
  const toggleFilter = (key, value) => {
    const params = new URLSearchParams(searchParams);
    const current = activeFilters[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    if (next.length) params.set(key, next.join(","));
    else params.delete(key);
    setSearchParams(params);
  };

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams);
    FILTER_DEFS.forEach(({ key }) => params.delete(key));
    setSearchParams(params);
  };

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

        {/* ============ FILTROS SOBRE EL RESULTADO ============ */}
        {!isSearching && hasSearched && results.branches.length > 0 && (
          <Paper sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              {FILTER_DEFS.map(({ key, label }) =>
                filterOptions[key].length > 1 ? (
                  // Con un solo valor posible el filtro no discrimina nada:
                  // se oculta en vez de ofrecer un chip que no cambia la vista.
                  <Stack
                    key={key}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ flexWrap: "wrap", rowGap: 1 }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ minWidth: 78, flexShrink: 0 }}
                    >
                      {label}
                    </Typography>
                    {filterOptions[key].map(({ value, count }) => {
                      const isActive = activeFilters[key].includes(value);
                      const text = key === "estado" ? STOCK_STATUS_LABEL[value] || value : value;
                      return (
                        <Chip
                          key={value}
                          label={`${text} (${count})`}
                          size="small"
                          clickable
                          onClick={() => toggleFilter(key, value)}
                          color={
                            isActive && key === "estado"
                              ? STOCK_STATUS_COLOR[value] || "primary"
                              : isActive
                                ? "primary"
                                : "default"
                          }
                          variant={isActive ? "filled" : "outlined"}
                        />
                      );
                    })}
                  </Stack>
                ) : null
              )}

              {hasActiveFilters && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
                  <Typography variant="body2" color="text.secondary">
                    Mostrando <strong>{visibleCount}</strong> de {results.totalItems}{" "}
                    {results.totalItems === 1 ? "ítem" : "ítems"}
                  </Typography>
                  <Button size="small" onClick={clearFilters} startIcon={<ClearIcon />}>
                    Limpiar filtros
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
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

        {/* Los filtros dejaron la pantalla vacia: se avisa y se ofrece la salida,
            para que no parezca que la busqueda no encontro nada. */}
        {!isSearching && hasSearched && results.branches.length > 0 && visibleCount === 0 && (
          <Alert
            severity="info"
            action={
              <Button color="inherit" size="small" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            }
          >
            Ningún ítem de los {results.totalItems} encontrados coincide con los filtros elegidos.
          </Alert>
        )}

        {!isSearching &&
          hasSearched &&
          visibleBranches.map((branch) => (
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
                <Table size="small" sx={{ tableLayout: "fixed", minWidth: TABLE_MIN_WIDTH }}>
                  <TableHead>
                    <TableRow>
                      {COLUMNS.map((col) => (
                        <TableCell key={col.key} align={col.align} sx={{ width: col.width }}>
                          {col.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {branch.items.map((item) => (
                      <TableRow key={item.id} hover>
                        {/* Con tableLayout fijo un nombre largo ya no ensancha la
                            columna: se recorta con elipsis. El nombre completo
                            queda accesible en el tooltip. */}
                        <TableCell sx={{ ...ELLIPSIS }}>
                          <Tooltip
                            title={
                              <>
                                {item.displayName}
                                <br />
                                {item.supplierName
                                  ? `Proveedor: ${item.supplierName}`
                                  : "Sin proveedor asignado"}
                              </>
                            }
                          >
                            <span>{item.displayName}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ ...ELLIPSIS }}>{item.categoryName}</TableCell>
                        <TableCell sx={{ ...ELLIPSIS }}>{item.conditionName || "—"}</TableCell>
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
