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

  // Umbrales de estado de stock (pedido / sobrestock)
  const [orderPct, setOrderPct] = React.useState("");
  const [savedOrderPct, setSavedOrderPct] = React.useState("");
  const [overstockPct, setOverstockPct] = React.useState("");
  const [savedOverstockPct, setSavedOverstockPct] = React.useState("");

  const load = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const map = await getSettings();
      const pct = map.replenish_target_pct?.value ?? "70";
      setReplenishPct(pct);
      setSavedPct(pct);
      const ord = map.stock_threshold_order_pct?.value ?? "70";
      setOrderPct(ord);
      setSavedOrderPct(ord);
      const over = map.stock_threshold_overstock_pct?.value ?? "120";
      setOverstockPct(over);
      setSavedOverstockPct(over);
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

  // Validación de los umbrales: pedido en [1,100], sobrestock en [1,500] y
  // siempre pedido < sobrestock (mismo criterio que el backend).
  const orderNum = Number(orderPct);
  const overstockNum = Number(overstockPct);
  const orderValid = Number.isFinite(orderNum) && orderNum >= 1 && orderNum <= 100;
  const overstockValid = Number.isFinite(overstockNum) && overstockNum >= 1 && overstockNum <= 500;
  const thresholdsCoherent = orderValid && overstockValid && orderNum < overstockNum;
  const thresholdsDirty = orderPct !== savedOrderPct || overstockPct !== savedOverstockPct;

  const handleSaveThresholds = React.useCallback(async () => {
    if (!thresholdsCoherent || !thresholdsDirty) return;
    setIsSaving(true);
    try {
      // El backend valida pedido < sobrestock en CADA guardado. Si se editan los
      // dos a la vez, guardar uno puede chocar con el valor viejo del otro. Para
      // evitarlo se guarda primero el que ENSANCHA el rango: subir el sobrestock
      // antes de subir el pedido; bajar el pedido antes de bajar el sobrestock.
      const newOrder = String(Math.round(orderNum));
      const newOver = String(Math.round(overstockNum));
      const saveOrder = async () => {
        const r = await updateSetting("stock_threshold_order_pct", newOrder);
        setSavedOrderPct(r.value); setOrderPct(r.value);
      };
      const saveOver = async () => {
        const r = await updateSetting("stock_threshold_overstock_pct", newOver);
        setSavedOverstockPct(r.value); setOverstockPct(r.value);
      };
      // Ensanchar primero (subir el techo) y luego ajustar el piso.
      if (overstockPct !== savedOverstockPct) await saveOver();
      if (orderPct !== savedOrderPct) await saveOrder();
      notifications.show("Umbrales guardados", { severity: "success", autoHideDuration: 3000 });
    } catch (err) {
      notifications.show(`Error: ${err.message}`, { severity: "error", autoHideDuration: 4000 });
    }
    setIsSaving(false);
  }, [thresholdsCoherent, thresholdsDirty, orderPct, overstockPct, orderNum, overstockNum, savedOrderPct, savedOverstockPct, notifications]);

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

      <Card variant="outlined" sx={{ maxWidth: 560, mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Umbrales de estado de stock
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Definen cómo se clasifica cada producto según su compliance
            (stock actual ÷ stock requerido):
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }} component="div">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Menor al umbral de pedido → <strong>Generar Pedido</strong></li>
              <li>Entre ambos umbrales → <strong>Stock Óptimo</strong></li>
              <li>Mayor al umbral de sobrestock → <strong>Sobrestock</strong></li>
            </ul>
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            Cambiar los umbrales aplica a cálculos futuros (próxima carga de un ítem
            y próxima sincronización de controles abiertos). Los controles ya
            completados no se modifican.
          </Alert>
          <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap">
            <TextField
              label="Umbral de pedido"
              type="number"
              size="small"
              value={orderPct}
              onChange={(e) => setOrderPct(e.target.value)}
              error={!orderValid || (overstockValid && orderNum >= overstockNum)}
              helperText={
                !orderValid
                  ? "Entre 1 y 100"
                  : overstockValid && orderNum >= overstockNum
                    ? "Debe ser menor al de sobrestock"
                    : " "
              }
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
              inputProps={{ min: 1, max: 100 }}
              sx={{ width: 190 }}
            />
            <TextField
              label="Umbral de sobrestock"
              type="number"
              size="small"
              value={overstockPct}
              onChange={(e) => setOverstockPct(e.target.value)}
              error={!overstockValid || (orderValid && overstockNum <= orderNum)}
              helperText={
                !overstockValid
                  ? "Entre 1 y 500"
                  : orderValid && overstockNum <= orderNum
                    ? "Debe ser mayor al de pedido"
                    : " "
              }
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
              inputProps={{ min: 1, max: 500 }}
              sx={{ width: 190 }}
            />
            <Button
              variant="contained"
              onClick={handleSaveThresholds}
              disabled={isSaving || !thresholdsCoherent || !thresholdsDirty}
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
