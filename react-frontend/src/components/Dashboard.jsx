import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import StorefrontIcon from '@mui/icons-material/Storefront';
import HubIcon from '@mui/icons-material/Hub';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SpeedIcon from '@mui/icons-material/Speed';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import ScienceIcon from '@mui/icons-material/Science';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { getAlerts } from '../data/alerts';
import { getSituation } from '../data/reports';
import { generateSituationPdf } from '../utils/situationPdf';
import PageContainer from './PageContainer';
import { dashboardListScrollSx } from '../utils/scrollStyles';

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value || 0);

// Tarjeta-resumen con número clave. Clic opcional (onClick) para navegar.
function SummaryCard({ icon, label, value, color, onClick }) {
  const content = (
    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box sx={{ color: `${color}.main`, display: 'flex' }}>{icon}</Box>
      <Box>
        <Typography variant="h4" fontWeight={600} color={`${color}.main`}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Box>
    </CardContent>
  );
  return (
    // El ancho lo define el grid contenedor (repeat(N, 1fr)); la card ocupa toda
    // su celda. height:100% para que las filas queden parejas con labels largos.
    <Card variant="outlined" sx={{ width: '100%', height: '100%' }}>
      {onClick ? <CardActionArea onClick={onClick} sx={{ height: '100%' }}>{content}</CardActionArea> : content}
    </Card>
  );
}

// Umbrales del tiempo de ciclo, en dias, por tipo de orden. Son DISTINTOS a
// proposito: un ciclo de proveedor depende del plazo de entrega (13-14 dias es
// lo normal), mientras que una orden interna del Hub se resuelve en 2-3 dias.
// Un umbral unico dejaria a proveedor siempre en rojo y al Hub siempre en azul,
// y el color no informaria nada. Valores definidos por el negocio (2026-08-24).
const CYCLE_THRESHOLDS = {
  supplier: { warning: 15, error: 20 },
  hub: { warning: 4, error: 5 },
};

// info (normal) -> warning -> error, segun los cortes de arriba. null (sin
// cierres en la ventana) no es 0 dias: se muestra "—" y queda en info.
function cycleColor(days, thresholds) {
  if (days == null) return 'info';
  if (days >= thresholds.error) return 'error';
  if (days >= thresholds.warning) return 'warning';
  return 'info';
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      setData(await getAlerts());
    } catch (err) {
      setError(err);
    }
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Descarga del informe de situación. Los datos se piden recién al hacer clic
  // (son 11 consultas): no tiene sentido cargarlos con el dashboard si el
  // usuario no va a pedir el PDF. El error se muestra sin tumbar la pantalla.
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [reportError, setReportError] = React.useState(null);

  const handleDownloadReport = React.useCallback(async () => {
    setIsDownloading(true);
    setReportError(null);
    try {
      generateSituationPdf(await getSituation());
    } catch (err) {
      setReportError(err);
    }
    setIsDownloading(false);
  }, []);

  // Totales para las tarjetas resumen.
  const totals = React.useMemo(() => {
    if (!data) return { muyPrio: 0, critical: 0, discTotal: 0 };
    return {
      muyPrio: data.muyPrioritarios.reduce((s, r) => s + r.faltantes, 0),
      // criticalBranches ya no tiene listado propio (se quitó a pedido), pero
      // sigue alimentando la tarjeta "Ítems en generar pedido". No borrar.
      critical: data.criticalBranches.reduce((s, r) => s + r.needOrderItems, 0),
      discTotal: data.discontinuedValue.reduce((s, r) => s + r.value, 0),
    };
  }, [data]);

  if (isLoading) {
    return (
      <PageContainer title="Dashboard" breadcrumbs={[{ title: 'Dashboard' }]}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      </PageContainer>
    );
  }

  // Si la carga falló (p. ej. /api/alerts dio timeout o 5xx transitorio),
  // `data` queda en null. Mostramos el error con opción de reintentar sin
  // intentar renderizar las listas (que reventarían al leer data.muyPrioritarios).
  if (!data) {
    return (
      <PageContainer title="Dashboard" breadcrumbs={[{ title: 'Dashboard' }]}>
        <Alert
          severity="error"
          sx={{ mt: 2 }}
          action={<Button color="inherit" size="small" onClick={load}>Reintentar</Button>}
        >
          {error?.message || 'No se pudieron cargar las alertas. Volvé a intentar.'}
        </Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Dashboard" breadcrumbs={[{ title: 'Dashboard' }]}>
      {/* El saludo conserva el ancho completo (queda centrado como antes); el
          botón se saca del flujo para anclarlo a la derecha sin correrlo. En
          xs vuelve al flujo normal, debajo del texto. */}
      <Box sx={{ mb: 3, position: 'relative' }}>
        <Typography variant="h5" gutterBottom>
          Bienvenido, {user?.name || user?.username}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Alertas tempranas — atendé primero lo más urgente.
        </Typography>
        <Button
          variant="outlined"
          startIcon={isDownloading ? <CircularProgress size={18} /> : <PictureAsPdfIcon />}
          onClick={handleDownloadReport}
          disabled={isDownloading}
          sx={{
            mt: { xs: 2, sm: 0 },
            position: { sm: 'absolute' },
            top: { sm: 0 },
            right: { sm: 0 },
          }}
        >
          {isDownloading ? 'Generando…' : 'Descargar informe'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message}</Alert>}
      {reportError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setReportError(null)}>
          {reportError.message || 'No se pudo generar el informe. Volvé a intentar.'}
        </Alert>
      )}

      {/* Tarjetas resumen — grid responsive: 5 col en desktop (2 filas de 5),
          que se reduce en pantallas chicas. Las tarjetas se rellenan según el rol. */}
      <Box
        sx={{
          mb: 3,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: 'repeat(1, 1fr)',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(5, 1fr)',
          },
        }}
      >
        <SummaryCard
          icon={<PriorityHighIcon fontSize="large" />}
          label="Faltantes MUY PRIORITARIOS"
          value={totals.muyPrio}
          color="error"
        />
        <SummaryCard
          icon={<WarningAmberIcon fontSize="large" />}
          label="Ítems en generar pedido"
          value={totals.critical}
          color="warning"
        />
        <SummaryCard
          icon={<StorefrontIcon fontSize="large" />}
          label="Órdenes pendientes (proveedor)"
          value={data?.pendingOrdersSupplier ?? 0}
          color="info"
          onClick={() => navigate('/orders?tab=external&status=pending')}
        />
        <SummaryCard
          icon={<HubIcon fontSize="large" />}
          label="Órdenes pendientes (Nodo Hub)"
          value={data?.pendingOrdersHub ?? 0}
          color="info"
          onClick={() => navigate('/orders?tab=internal&status=pending')}
        />
        <SummaryCard
          icon={<AssignmentTurnedInIcon fontSize="large" />}
          label="Órdenes autorizadas"
          value={data?.authorizedOrders ?? 0}
          color="primary"
          onClick={() => navigate('/orders?status=autorizado')}
        />
        <SummaryCard
          icon={<SpeedIcon fontSize="large" />}
          label="Compliance promedio (controles activos)"
          value={data?.avgCompliance != null ? `${data.avgCompliance}%` : '—'}
          color={
            data?.avgCompliance == null ? 'info'
              : data.avgCompliance < 70 ? 'error'
              : data.avgCompliance <= 120 ? 'success'
              : 'warning'
          }
        />
        {/* Tiempo de ciclo = cuanto tardamos en CERRAR una orden (finalized_at -
            created_at), promedio de las finalizadas en los ultimos 30 dias.
            Reemplaza a la antiguedad del backlog abierto, que no servia para
            seguimiento porque se reiniciaba al cerrar las ordenes.
            El '—' es "no hubo cierres en la ventana", que no es lo mismo que 0. */}
        <SummaryCard
          icon={<HourglassBottomIcon fontSize="large" />}
          label="Tiempo prom. ciclo órdenes (Proveedor)"
          value={
            data?.closedOrdersSupplier
              ? `${data.cycleTimeSupplierDays} ${data.cycleTimeSupplierDays === 1 ? 'día' : 'días'}`
              : '—'
          }
          color={cycleColor(data?.cycleTimeSupplierDays, CYCLE_THRESHOLDS.supplier)}
        />
        <SummaryCard
          icon={<HourglassBottomIcon fontSize="large" />}
          label="Tiempo prom. ciclo órdenes (Nodo Hub)"
          value={
            data?.closedOrdersHub
              ? `${data.cycleTimeHubDays} ${data.cycleTimeHubDays === 1 ? 'día' : 'días'}`
              : '—'
          }
          color={cycleColor(data?.cycleTimeHubDays, CYCLE_THRESHOLDS.hub)}
        />
        {(user?.role === 'admin' || user?.role === 'manager') && (
          <SummaryCard
            icon={<ScienceIcon fontSize="large" />}
            label="Marcas a evaluar"
            value={data?.brandTrialsDue ?? 0}
            color={data?.brandTrialsDue > 0 ? 'warning' : 'info'}
            onClick={() => navigate('/brand-trials?status=due')}
          />
        )}
        <SummaryCard
          icon={<Inventory2Icon fontSize="large" />}
          label="Stock discontinuo valorizado"
          value={formatCurrency(totals.discTotal)}
          color="secondary"
        />
      </Box>

      {/* Listas accionables */}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="flex-start">
        {/* Faltantes MUY PRIORITARIOS por control */}
        <Card variant="outlined" sx={{ flex: '1 1 340px', minWidth: 320 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <PriorityHighIcon color="error" fontSize="small" />
              <Typography variant="h6">Faltantes MUY PRIORITARIOS</Typography>
            </Stack>
            <Divider sx={{ mb: 1 }} />
            {data.muyPrioritarios.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Sin faltantes prioritarios. 🎉</Typography>
            ) : (
              <Box sx={dashboardListScrollSx}>
              <List dense disablePadding>
                {data.muyPrioritarios.map((r) => (
                  <ListItemButton
                    key={`mp-${r.controlId}`}
                    onClick={() => navigate(`/stock-control/${r.branchId}/control/${r.controlId}?filter=muyprioritario`, { state: { backTo: '/' } })}
                  >
                    <ListItemText primary={`${r.branchName} — ${r.categoryName}`} />
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="error.main" fontWeight={500}>
                        {formatCurrency(r.faltanteValor)}
                      </Typography>
                      <Chip label={r.faltantes} color="error" size="small" />
                    </Stack>
                  </ListItemButton>
                ))}
              </List>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Sucursales con SOBRESTOCK */}
        <Card variant="outlined" sx={{ flex: '1 1 340px', minWidth: 320 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <TrendingUpIcon color="warning" fontSize="small" />
              <Typography variant="h6">Sucursales con SOBRESTOCK</Typography>
            </Stack>
            <Divider sx={{ mb: 1 }} />
            {data.overstockBranches.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Sin sobrestock relevante.</Typography>
            ) : (
              <Box sx={dashboardListScrollSx}>
              <List dense disablePadding>
                {data.overstockBranches.map((r) => (
                  <ListItemButton
                    key={`ov-${r.controlId}`}
                    onClick={() => navigate(`/stock-control/${r.branchId}/control/${r.controlId}?filter=overstock`, { state: { backTo: '/' } })}
                  >
                    <ListItemText primary={`${r.branchName} — ${r.categoryName}`} />
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="warning.main" fontWeight={500}>
                        {formatCurrency(r.sobranteValor)}
                      </Typography>
                      <Chip label={r.excedentes} color="warning" size="small" />
                    </Stack>
                  </ListItemButton>
                ))}
              </List>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Discontinuos valorizados */}
        <Card variant="outlined" sx={{ flex: '1 1 340px', minWidth: 320 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Inventory2Icon color="secondary" fontSize="small" />
              <Typography variant="h6">Stock discontinuo (sobrante)</Typography>
            </Stack>
            <Divider sx={{ mb: 1 }} />
            {data.discontinuedValue.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Sin stock discontinuo relevante.</Typography>
            ) : (
              <Box sx={dashboardListScrollSx}>
              <List dense disablePadding>
                {data.discontinuedValue.map((r) => (
                  <ListItemButton
                    key={`dv-${r.controlId}`}
                    onClick={() => navigate(`/stock-control/${r.branchId}/control/${r.controlId}?tab=discontinued`, { state: { backTo: '/' } })}
                  >
                    <ListItemText primary={`${r.branchName} — ${r.categoryName}`} />
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="text.secondary">
                        {r.units} u.
                      </Typography>
                      <Typography variant="body2" fontWeight={500} color="secondary.main">
                        {formatCurrency(r.value)}
                      </Typography>
                    </Stack>
                  </ListItemButton>
                ))}
              </List>
              </Box>
            )}
          </CardContent>
        </Card>
      </Stack>
    </PageContainer>
  );
}
