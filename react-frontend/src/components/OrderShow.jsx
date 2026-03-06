import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Autocomplete from '@mui/material/Autocomplete';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { DataGrid, gridClasses } from '@mui/x-data-grid';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import { useParams, useNavigate } from 'react-router';
import { useDialogs } from '../hooks/useDialogs/useDialogs';
import useNotifications from '../hooks/useNotifications/useNotifications';
import { useAuth } from '../context/AuthContext';
import {
  getOrderDetail,
  updateOrderStatus,
  updateOrderItemReceived,
  deleteOrder,
  getOrderStatusLabel,
  getOrderStatusColor,
} from '../data/orders';
import PageContainer from './PageContainer';

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

const EDITABLE_STATUSES = ['pending', 'sent', 'partial'];
const STATUS_OPTIONS = [
  { value: 'pending',   label: 'Pendiente' },
  { value: 'sent',      label: 'Enviado' },
  { value: 'partial',   label: 'Recibido parcial' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function OrderShow() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const notifications = useNotifications();
  const { user } = useAuth();

  const [order, setOrder] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // Estado para cambio de status
  const [newStatus, setNewStatus] = React.useState('');
  const [statusNotes, setStatusNotes] = React.useState('');
  const [isSavingStatus, setIsSavingStatus] = React.useState(false);

  // Estado para edicion inline de recepcion
  const [editingItemId, setEditingItemId] = React.useState(null);
  const [editingQty, setEditingQty] = React.useState('');
  const [isSavingItem, setIsSavingItem] = React.useState(false);

  const isEmployee = user?.role === 'employee';
  const canEditStatus = !isEmployee;
  const canDelete = !isEmployee;

  const handleDelete = React.useCallback(async () => {
    if (!order) return;
    const confirmed = await dialogs.confirm(
      `¿Deseas eliminar la orden #${order.id} (${order.branchName} — ${order.period})?`,
      {
        title: '¿Eliminar orden?',
        severity: 'error',
        okText: 'Eliminar',
        cancelText: 'Cancelar',
      }
    );
    if (!confirmed) return;
    try {
      await deleteOrder(order.id);
      notifications.show('Orden eliminada', { severity: 'success', autoHideDuration: 3000 });
      navigate('/orders');
    } catch (err) {
      notifications.show(`Error: ${err.message}`, { severity: 'error', autoHideDuration: 5000 });
    }
  }, [order, dialogs, notifications, navigate]);

  // Sincronizar el Autocomplete de estado cuando la orden cambia
  React.useEffect(() => {
    if (order) setNewStatus(order.status);
  }, [order]);

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { order: orderData, items: itemsData } = await getOrderDetail(orderId);
      setOrder(orderData);
      setItems(itemsData);
      setStatusNotes(orderData.notes || '');
    } catch (err) {
      setError(err);
    }
    setIsLoading(false);
  }, [orderId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const isOrderEditable = order && EDITABLE_STATUSES.includes(order.status);

  const handleSaveStatus = React.useCallback(async () => {
    if (!order || newStatus === order.status) return;
    setIsSavingStatus(true);
    try {
      const updated = await updateOrderStatus(order.id, newStatus, statusNotes || null);
      setOrder(updated);
      notifications.show('Estado actualizado', { severity: 'success', autoHideDuration: 3000 });
    } catch (err) {
      notifications.show(`Error: ${err.message}`, { severity: 'error', autoHideDuration: 4000 });
    }
    setIsSavingStatus(false);
  }, [order, newStatus, statusNotes, notifications]);

  const handleEditItem = React.useCallback((item) => {
    setEditingItemId(item.id);
    setEditingQty(String(item.quantityReceived));
  }, []);

  const handleSaveItemReceived = React.useCallback(async (item) => {
    const qty = parseInt(editingQty, 10);
    if (isNaN(qty) || qty < 0) return;
    setIsSavingItem(true);
    try {
      const { order: updatedOrder, items: updatedItems } = await updateOrderItemReceived(item.id, qty);
      setOrder(updatedOrder);
      setItems(updatedItems);
      setEditingItemId(null);
      notifications.show('Recepcion actualizada', { severity: 'success', autoHideDuration: 3000 });
    } catch (err) {
      notifications.show(`Error: ${err.message}`, { severity: 'error', autoHideDuration: 4000 });
    }
    setIsSavingItem(false);
  }, [editingQty, notifications]);

  const columns = React.useMemo(
    () => [
      { field: 'displayName', headerName: 'Producto', flex: 1, minWidth: 220 },
      { field: 'categoryName', headerName: 'Rubro', width: 120 },
      {
        field: 'quantityOrdered',
        headerName: 'Pedido',
        width: 90,
        type: 'number',
      },
      {
        field: 'quantityReceived',
        headerName: 'Recibido',
        width: 120,
        renderCell: ({ row }) => {
          if (editingItemId === row.id) {
            return (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <TextField
                  size="small"
                  type="number"
                  value={editingQty}
                  onChange={(e) => setEditingQty(e.target.value)}
                  inputProps={{ min: 0, max: row.quantityOrdered }}
                  sx={{ width: 70 }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveItemReceived(row);
                    if (e.key === 'Escape') setEditingItemId(null);
                  }}
                />
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => handleSaveItemReceived(row)}
                  disabled={isSavingItem}
                >
                  {isSavingItem ? <CircularProgress size={14} /> : <SaveIcon fontSize="small" />}
                </IconButton>
              </Stack>
            );
          }
          return (
            <Box
              sx={{ display: 'flex', alignItems: 'center', height: '100%', cursor: isOrderEditable ? 'pointer' : 'default' }}
              onClick={() => isOrderEditable && handleEditItem(row)}
            >
              <Typography
                variant="body2"
                color={row.quantityReceived >= row.quantityOrdered ? 'success.main' : 'text.primary'}
              >
                {row.quantityReceived} / {row.quantityOrdered}
              </Typography>
            </Box>
          );
        },
      },
      {
        field: 'unitCost',
        headerName: 'Costo unit.',
        width: 130,
        renderCell: ({ value }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2">{value > 0 ? formatCurrency(value) : '-'}</Typography>
          </Box>
        ),
      },
      {
        field: 'costEstimate',
        headerName: 'Subtotal',
        width: 130,
        renderCell: ({ value }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" fontWeight={500}>
              {value > 0 ? formatCurrency(value) : '-'}
            </Typography>
          </Box>
        ),
      },
      {
        field: 'stockCurrent',
        headerName: 'Stock actual',
        width: 110,
        renderCell: ({ value }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
            <Typography variant="body2">{value}</Typography>
          </Box>
        ),
      },
    ],
    [editingItemId, editingQty, isSavingItem, isOrderEditable, handleEditItem, handleSaveItemReceived]
  );

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <PageContainer title="Orden de Reposicion" breadcrumbs={[{ title: 'Ordenes', href: '/orders' }]}>
        <Alert severity="error">{error.message}</Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={order ? `Orden #${order.id} — ${order.branchName} — ${order.period}` : 'Orden de Reposicion'}
      breadcrumbs={[
        { title: 'Ordenes de Reposicion', href: '/orders' },
        { title: `Orden #${order?.id}` },
      ]}
      actions={
        <Stack direction="row" spacing={1}>
          {canDelete && (
            <Tooltip title="Eliminar orden" enterDelay={1000}>
              <IconButton size="small" color="error" onClick={handleDelete}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Volver" enterDelay={1000}>
            <IconButton size="small" onClick={() => navigate('/orders')}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      }
    >
      {/* Header con estado y costo total */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} alignItems="center" flexWrap="wrap">
        <Chip
          label={getOrderStatusLabel(order.status)}
          color={getOrderStatusColor(order.status)}
        />
        <Typography variant="body2">
          Items: <strong>{order.totalItems}</strong>
        </Typography>
        <Typography variant="body2">
          Uds. pedidas: <strong>{order.totalUnitsOrdered}</strong>
        </Typography>
        <Typography variant="body2">
          Uds. recibidas: <strong>{order.totalUnitsReceived}</strong>
        </Typography>
        <Typography variant="body2" color="primary.main">
          Costo estimado: <strong>{formatCurrency(order.totalCostEstimate)}</strong>
        </Typography>
      </Stack>

      {/* Panel de cambio de estado — solo admin/manager */}
      {canEditStatus && isOrderEditable && (
        <Stack direction="row" spacing={2} sx={{ mb: 3 }} alignItems="flex-end">
          <Autocomplete
            size="small"
            options={STATUS_OPTIONS}
            getOptionLabel={(o) => o.label}
            value={STATUS_OPTIONS.find((s) => s.value === newStatus) || null}
            onChange={(_, val) => val && setNewStatus(val.value)}
            isOptionEqualToValue={(o, v) => o.value === v.value}
            disableClearable
            renderInput={(params) => <TextField {...params} label="Estado" />}
            sx={{ minWidth: 200 }}
          />
          <TextField
            size="small"
            label="Notas"
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
            sx={{ minWidth: 280 }}
          />
          <Button
            variant="contained"
            onClick={handleSaveStatus}
            disabled={isSavingStatus || newStatus === order.status}
            startIcon={isSavingStatus ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          >
            Guardar estado
          </Button>
        </Stack>
      )}

      {/* Tabla de items */}
      <Box sx={{ flex: 1, width: '100%' }}>
        <DataGrid
          rows={items}
          columns={columns}
          disableRowSelectionOnClick
          autoHeight
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{
            [`& .${gridClasses.columnHeader}, & .${gridClasses.cell}`]: { outline: 'transparent' },
            [`& .${gridClasses.columnHeader}:focus-within, & .${gridClasses.cell}:focus-within`]: { outline: 'none' },
          }}
        />
      </Box>

      {/* Notas de la orden */}
      {order.notes && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Notas: {order.notes}
          </Typography>
        </Box>
      )}
    </PageContainer>
  );
}
