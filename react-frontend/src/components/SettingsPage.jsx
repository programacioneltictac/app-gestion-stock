import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SaveIcon from "@mui/icons-material/Save";
import useNotifications from "../hooks/useNotifications/useNotifications";
import { getSettings, updateSetting } from "../data/settings";
import PageContainer from "./PageContainer";

export default function SettingsPage() {
  const notifications = useNotifications();

  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [isSaving, setIsSaving] = React.useState(false);

  // % objetivo de reposicion
  const [replenishPct, setReplenishPct] = React.useState("");
  const [savedPct, setSavedPct] = React.useState("");

  const load = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const map = await getSettings();
      const pct = map.replenish_target_pct?.value ?? "70";
      setReplenishPct(pct);
      setSavedPct(pct);
    } catch (err) {
      setError(err);
    }
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const pctNum = Number(replenishPct);
  const pctValid = Number.isFinite(pctNum) && pctNum >= 1 && pctNum <= 100;
  const pctDirty = replenishPct !== savedPct;

  const handleSavePct = React.useCallback(async () => {
    if (!pctValid || !pctDirty) return;
    setIsSaving(true);
    try {
      const saved = await updateSetting("replenish_target_pct", String(Math.round(pctNum)));
      setSavedPct(saved.value);
      setReplenishPct(saved.value);
      notifications.show("Configuración guardada", { severity: "success", autoHideDuration: 3000 });
    } catch (err) {
      notifications.show(`Error: ${err.message}`, { severity: "error", autoHideDuration: 4000 });
    }
    setIsSaving(false);
  }, [pctValid, pctDirty, pctNum, notifications]);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <PageContainer title="Configuración" breadcrumbs={[{ title: "Configuración" }]}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message}</Alert>}

      <Card variant="outlined" sx={{ maxWidth: 560 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Reposición de stock
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Porcentaje del stock requerido al que se repone al generar órdenes.
            Por ejemplo, con 70% un producto que requiere 100 unidades y tiene 20
            se pedirá hasta llegar a 70 (50 unidades), no hasta 100. No afecta los
            umbrales que definen el estado del stock.
          </Typography>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <TextField
              label="Objetivo de reposición"
              type="number"
              size="small"
              value={replenishPct}
              onChange={(e) => setReplenishPct(e.target.value)}
              error={!pctValid}
              helperText={!pctValid ? "Debe ser un número entre 1 y 100" : " "}
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
              inputProps={{ min: 1, max: 100 }}
              sx={{ width: 200 }}
            />
            <Button
              variant="contained"
              onClick={handleSavePct}
              disabled={isSaving || !pctValid || !pctDirty}
              startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              sx={{ mt: 0.5 }}
            >
              Guardar
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
