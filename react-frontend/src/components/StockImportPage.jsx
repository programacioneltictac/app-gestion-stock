import * as React from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import useNotifications from "../hooks/useNotifications/useNotifications";
import importService from "../services/importService";
import PageContainer from "./PageContainer";

const nf = new Intl.NumberFormat("es-AR");

/** Variacion entre el stock actual y el que trae el archivo, para el chip. */
function deltaChip(current, next) {
  const delta = next - current;
  if (current === 0 && next === 0) return null;
  const pct = current > 0 ? Math.round((delta / current) * 100) : null;
  const label =
    (delta >= 0 ? "+" : "") + nf.format(delta) + (pct !== null ? ` (${pct >= 0 ? "+" : ""}${pct}%)` : "");
  // Una caida fuerte es lo que hay que mirar antes de confirmar: puede ser un
  // export incompleto. No se bloquea, se marca.
  const color = pct !== null && pct <= -30 ? "warning" : delta < 0 ? "default" : "success";
  return <Chip size="small" label={label} color={color} variant="outlined" />;
}

export default function StockImportPage() {
  const notifications = useNotifications();

  const [file, setFile] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const inputRef = React.useRef(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setPreview(null);
    setResult(null);
    setError(null);
    setIsAnalyzing(true);
    try {
      const data = await importService.preview(selected);
      setPreview(data);
    } catch (err) {
      setError(err);
    }
    setIsAnalyzing(false);
  };

  const handleImport = async () => {
    if (!preview || !file) return;
    setIsImporting(true);
    setError(null);
    try {
      const data = await importService.commit(file, preview.branch.id);
      setResult(data);
      setPreview(null);
      notifications.show(
        `Stock de ${data.branch.name} importado: ${nf.format(data.stats.synced)} items.`,
        { severity: "success", autoHideDuration: 5000 },
      );
    } catch (err) {
      setError(err);
    }
    setIsImporting(false);
  };

  return (
    <PageContainer
      title="Importar stock (CSV)"
      breadcrumbs={[{ title: "Importar stock" }]}
    >
      <Stack spacing={2}>
        <Alert severity="info">
          <AlertTitle>Carga manual de contingencia</AlertTitle>
          Se usa cuando la API de IDUO no está disponible. Exportá el listado de
          stock de <strong>una sucursal</strong> desde IDUO y subilo acá. El
          archivo se analiza primero: no se modifica nada hasta que confirmes.
          <Box sx={{ mt: 1 }}>
            <strong>Importante:</strong> no abras el CSV en Excel antes de
            subirlo. Excel convierte los códigos largos a notación científica
            (<code>3,10119E+11</code>) y ese daño no se puede revertir.
          </Box>
        </Alert>

        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                startIcon={<UploadFileIcon />}
                component="label"
                disabled={isAnalyzing || isImporting}
              >
                Elegir archivo CSV
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={handleFile}
                />
              </Button>
              {file && (
                <Typography variant="body2" color="text.secondary">
                  {file.name} ({nf.format(Math.round(file.size / 1024))} KB)
                </Typography>
              )}
              {isAnalyzing && <CircularProgress size={20} />}
              {(preview || result || error) && !isAnalyzing && (
                <Button size="small" onClick={reset} disabled={isImporting}>
                  Limpiar
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            <AlertTitle>No se pudo procesar el archivo</AlertTitle>
            {error.message}
            {error.details?.length > 0 && (
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
                {error.details.map((d) => (
                  <li key={d}>
                    <Typography variant="caption">{d}</Typography>
                  </li>
                ))}
              </Box>
            )}
          </Alert>
        )}

        {preview && (
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6">
                    {preview.branch.name}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      (en el archivo: &quot;{preview.fileBranchName}&quot;)
                    </Typography>
                  </Typography>
                  {preview.exportedAt && (
                    <Typography variant="body2" color="text.secondary">
                      Exportado de IDUO el{" "}
                      {new Date(preview.exportedAt).toLocaleString("es-AR")}
                    </Typography>
                  )}
                </Box>

                <Divider />

                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Filas en el archivo</Typography>
                    <Typography variant="h6">{nf.format(preview.totals.rowsInFile)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Se actualizan</Typography>
                    <Typography variant="h6">{nf.format(preview.totals.toUpdate)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Productos nuevos</Typography>
                    <Typography variant="h6" color={preview.totals.toCreate > 0 ? "warning.main" : "inherit"}>
                      {nf.format(preview.totals.toCreate)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Stock total</Typography>
                    <Typography variant="h6">{nf.format(preview.totals.totalStock)}</Typography>
                  </Box>
                </Stack>

                {preview.totals.toCreate > 0 && (
                  <Alert severity="warning" icon={<WarningAmberIcon />}>
                    Se van a <strong>crear {nf.format(preview.totals.toCreate)} productos
                    nuevos</strong> que hoy no existen en la app. Si esperabas
                    muchos menos, revisá que el archivo sea de la sucursal correcta
                    antes de confirmar.
                  </Alert>
                )}

                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Stock por rubro: archivo vs. lo que hay hoy
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Rubro</TableCell>
                        <TableCell align="right">Items</TableCell>
                        <TableCell align="right">Stock archivo</TableCell>
                        <TableCell align="right">Stock actual</TableCell>
                        <TableCell align="right">Variación</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.categories.map((c) => (
                        <TableRow key={c.categoryId}>
                          <TableCell>{c.categoryName}</TableCell>
                          <TableCell align="right">{nf.format(c.items)}</TableCell>
                          <TableCell align="right">{nf.format(c.stock)}</TableCell>
                          <TableCell align="right">{nf.format(c.currentStock)}</TableCell>
                          <TableCell align="right">{deltaChip(c.currentStock, c.stock)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>

                {preview.untouchedCategories?.length > 0 && (
                  <Alert severity="info">
                    <AlertTitle>Rubros que no vienen en el archivo</AlertTitle>
                    Conservan el stock que ya tenían (no se ponen en cero):{" "}
                    {preview.untouchedCategories
                      .map((c) => `${c.categoryName} (${nf.format(c.currentStock)} u.)`)
                      .join(", ")}
                    .
                  </Alert>
                )}

                {preview.unknownCategory?.length > 0 && (
                  <Alert severity="warning">
                    <AlertTitle>
                      {preview.unknownCategory.length} producto(s) sin rubro reconocible
                    </AlertTitle>
                    No se van a importar: el nombre no termina en un rubro conocido.
                    <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
                      {preview.unknownCategory.slice(0, 5).map((u) => (
                        <li key={u.line}>
                          <Typography variant="caption">
                            Línea {u.line}: {u.productName}
                          </Typography>
                        </li>
                      ))}
                    </Box>
                  </Alert>
                )}

                {preview.warnings?.length > 0 && (
                  <Alert severity="warning">
                    <AlertTitle>{preview.warnings.length} advertencia(s) de lectura</AlertTitle>
                    <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
                      {preview.warnings.slice(0, 5).map((w) => (
                        <li key={w}>
                          <Typography variant="caption">{w}</Typography>
                        </li>
                      ))}
                    </Box>
                  </Alert>
                )}

                <Divider />

                <Stack direction="row" spacing={2} alignItems="center">
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleImport}
                    disabled={isImporting || preview.totals.importable === 0}
                    startIcon={isImporting ? <CircularProgress size={16} /> : <CheckCircleIcon />}
                  >
                    {isImporting
                      ? "Importando…"
                      : `Confirmar e importar ${nf.format(preview.totals.importable)} items`}
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Actualiza el stock de {preview.branch.name} y los controles activos de esa sucursal.
                  </Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        )}

        {result && (
          <Alert severity="success">
            <AlertTitle>Importación completada — {result.branch.name}</AlertTitle>
            {nf.format(result.stats.synced)} items actualizados
            {result.stats.created > 0 && `, ${nf.format(result.stats.created)} productos nuevos`}
            {result.stats.grouped > 0 && `, ${nf.format(result.stats.grouped)} grupos`}
            {result.stats.errors > 0 && ` — ${nf.format(result.stats.errors)} con error (ver logs)`}
            .
          </Alert>
        )}
      </Stack>
    </PageContainer>
  );
}
