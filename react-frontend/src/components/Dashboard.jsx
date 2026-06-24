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
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SpeedIcon from '@mui/icons-material/Speed';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import ScienceIcon from '@mui/icons-material/Science';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { getAlerts } from '../data/alerts';
import PageContainer from './PageContainer';

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
    <Card
      variant="outlined"
      sx={{
        // 4 tarjetas por fila en desktop, 2 en tablet, 1 en móvil. El gap del
        // Stack es 16px (spacing=2); para 4 columnas se descuentan 12px por celda.
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: {
          xs: '100%',
          sm: 'calc(50% - 8px)',
          md: 'calc(25% - 12px)',
        },
        minWidth: 200,
      }}
    >
      {onClick ? <CardActionArea onClick={onClick}>{content}</CardActionArea> : content}
    </Card>
  );
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

  // Totales para las tarjetas resumen.
  const totals = React.useMemo(() => {
    if (!data) return { muyPrio: 0, critical: 0, discTotal: 0 };
    return {
      muyPrio: data.muyPrioritarios.reduce((s, r) => s + r.faltantes, 0),
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
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Bienvenido, {user?.name || user?.username}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Alertas tempranas — atendé primero lo más urgente.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message}</Alert>}

      {/* Tarjetas resumen */}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
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
          icon={<ShoppingCartIcon fontSize="large" />}
          label="Órdenes pendientes"
          value={data?.pendingOrders ?? 0}
          color="info"
          onClick={() => navigate('/orders?status=pending')}
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
        <SummaryCard
          icon={<HourglassBottomIcon fontSize="large" />}
          label="Antigüedad prom. órdenes en gestión"
          value={
            data?.openOrdersTotal
              ? `${data.avgOrderAgeDays} ${data.avgOrderAgeDays === 1 ? 'día' : 'días'}`
              : '—'
          }
          color={data?.avgOrderAgeDays != null && data.avgOrderAgeDays >= 7 ? 'warning' : 'info'}
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
      </Stack>

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
              <List dense disablePadding>
                {data.muyPrioritarios.map((r) => (
                  <ListItemButton
                    key={`mp-${r.controlId}`}
                    onClick={() => navigate(`/stock-control/${r.branchId}/control/${r.controlId}`)}
                  >
                    <ListItemText primary={`${r.branchName} — ${r.categoryName}`} />
                    <Chip label={r.faltantes} color="error" size="small" />
                  </ListItemButton>
                ))}
              </List>
            )}
          </CardContent>
        </Card>

        {/* Sucursales críticas */}
        <Card variant="outlined" sx={{ flex: '1 1 340px', minWidth: 320 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <WarningAmberIcon color="warning" fontSize="small" />
              <Typography variant="h6">Sucursales críticas</Typography>
            </Stack>
            <Divider sx={{ mb: 1 }} />
            {data.criticalBranches.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Sin ítems pendientes de pedido.</Typography>
            ) : (
              <List dense disablePadding>
                {data.criticalBranches.map((r) => (
                  <ListItemButton
                    key={`cb-${r.branchId}`}
                    onClick={() => navigate(`/stock-control/${r.branchId}`)}
                  >
                    <ListItemText
                      primary={r.branchName}
                      secondary={r.isHub ? 'Nodo Hub' : undefined}
                    />
                    <Chip label={`${r.needOrderItems} a pedir`} color="warning" size="small" />
                  </ListItemButton>
                ))}
              </List>
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
              <List dense disablePadding>
                {data.discontinuedValue.slice(0, 8).map((r) => (
                  <ListItemButton
                    key={`dv-${r.controlId}`}
                    onClick={() => navigate(`/stock-control/${r.branchId}/control/${r.controlId}?tab=discontinued`)}
                  >
                    <ListItemText primary={`${r.branchName} — ${r.categoryName}`} />
                    <Typography variant="body2" fontWeight={500} color="secondary.main">
                      {formatCurrency(r.value)}
                    </Typography>
                  </ListItemButton>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Stack>
    </PageContainer>
  );
}
