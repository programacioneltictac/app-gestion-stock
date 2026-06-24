import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Autocomplete from '@mui/material/Autocomplete';
import IconButton from '@mui/material/IconButton';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';
import { dataGridSx } from './dataGridStyles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useDialogs } from '../hooks/useDialogs/useDialogs';
import useNotifications from '../hooks/useNotifications/useNotifications';
import { useAuth } from '../context/AuthContext';
import {
  getOrderDetail,
  updateOrderStatus,
  updateOrderItemReceived,
  receiveAllOrderItems,
  deleteOrder,
  deleteOrderItem,
  getOrderStatusLabel,
  getOrderStatusColor,
  getOrderElapsedDays,
  formatElapsedDays,
  ORDER_STATUSES_EDITABLE,
  ORDER_STATUSES_RECEIVING,
  ORDER_STATUS_OPTIONS,
} from '../data/orders';
import PageContainer from './PageContainer';
import ActionButton from './ActionButton';
import { exportOrderToExcel } from '../utils/orderExcel';

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);


export default function OrderShow() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dialogs = useDialogs();
  const notifications = useNotifications();
  const { user } = useAuth();

  // Tab de origen (Proveedores / Nodo Hub) para que "Volver" regrese al mismo.
  // Lo pasa OrderList vía state al abrir la orden; si no viene (acceso directo),
  // se vuelve a /orders sin tab y la lista usa su default.
  const fromTab = location.state?.fromTab;
  const backToList = React.useCallback(() => {
    navigate(fromTab ? `/orders?tab=${fromTab}` : '/orders');
  }, [navigate, fromTab]);

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
      backToList();
    } catch (err) {
      notifications.show(`Error: ${err.message}`, { severity: 'error', autoHideDuration: 5000 });
    }
  }, [order, dialogs, notifications, backToList]);

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

  // Borra un ítem de la orden. Rehabilita su producto en el control de origen.
  // Si era el último ítem, la orden queda vacía y se elimina (volvemos al listado).
  const handleDeleteItem = React.useCallback(async (item) => {
    const confirmed = await dialogs.confirm(
      `¿Quitar "${item.displayName}" de esta orden? Volverá a estar disponible para pedir en su control.`,
      {
        title: '¿Quitar ítem?',
        severity: 'warning',
        okText: 'Quitar',
        cancelText: 'Cancelar',
      }
    );
    if (!confirmed) return;
    try {
      const { orderDeleted } = await deleteOrderItem(item.id);
      if (orderDeleted) {
        notifications.show('Ítem quitado; la orden quedó vacía y fue eliminada', { severity: 'success', autoHideDuration: 4000 });
        backToList();
      } else {
        notifications.show('Ítem quitado de la orden', { severity: 'success', autoHideDuration: 3000 });
        loadData();
      }
    } catch (err) {
      notifications.show(`Error: ${err.message}`, { severity: 'error', autoHideDuration: 4000 });
    }
  }, [dialogs, notifications, backToList, loadData]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const isOrderEditable = order && ORDER_STATUSES_EDITABLE.includes(order.status);
  // La recepción de mercadería solo se habilita en 'Pedido realizado'.
  const canReceive = order && ORDER_STATUSES_RECEIVING.includes(order.status);
  const hasPendingItems = items.some((it) => it.quantityReceived < it.quantityOrdered);

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

  // Check de "recibido completo": marca el item como recibido en su totalidad
  // (quantityReceived = quantityOrdered) o lo vuelve a 0 al desmarcar. Reusa el
  // mismo endpoint que la carga parcial.
  const handleToggleReceived = React.useCallback(async (item) => {
    const target = item.quantityReceived >= item.quantityOrdered ? 0 : item.quantityOrdered;
    setIsSavingItem(true);
    try {
      const { order: updatedOrder, items: updatedItems } = await updateOrderItemReceived(item.id, target);
      setOrder(updatedOrder);
      setItems(updatedItems);
      setEditingItemId(null);
    } catch (err) {
      notifications.show(`Error: ${err.message}`, { severity: 'error', autoHideDuration: 4000 });
    }
    setIsSavingItem(false);
  }, [notifications]);

  const [isReceivingAll, setIsReceivingAll] = React.useState(false);

  // Marca toda la orden como recibida (todos los items en su totalidad) y la
  // deja en 'completed'. Una sola llamada atomica al backend.
  const handleReceiveAll = React.useCallback(async () => {
    if (!order) return;
    const confirmed = await dialogs.confirm(
      `¿Marcar todos los items de la orden #${order.id} como recibidos? La orden quedará completada.`,
      {
        title: 'Marcar todo recibido',
        severity: 'success',
        okText: 'Marcar todo',
        cancelText: 'Cancelar',
      }
    );
    if (!confirmed) return;
    setIsReceivingAll(true);
    try {
      const { order: updatedOrder, items: updatedItems } = await receiveAllOrderItems(order.id);
      setOrder(updatedOrder);
      setItems(updatedItems);
      notifications.show('Orden marcada como recibida', { severity: 'success', autoHideDuration: 3000 });
    } catch (err) {
      notifications.show(`Error: ${err.message}`, { severity: 'error', autoHideDuration: 4000 });
    }
    setIsReceivingAll(false);
  }, [order, dialogs, notifications]);

  const handleDownloadExcel = React.useCallback(async () => {
    if (!order) return;
    try {
      await exportOrderToExcel(order, items);
    } catch (err) {
      notifications.show(`Error al generar el Excel: ${err.message}`, { severity: 'error', autoHideDuration: 4000 });
    }
  }, [order, items, notifications]);

  const columns = React.useMemo(
    () => [
      {
        field: 'done',
        headerName: '',
        width: 56,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: 'center',
        headerAlign: 'center',
        renderCell: ({ row }) => {
          const isDone = row.quantityReceived >= row.quantityOrdered;
          return (
            <Tooltip title={isDone ? 'Recibido completo — clic para desmarcar' : 'Marcar como recibido completo'} enterDelay={600}>
              <span>
                <Checkbox
                  size="small"
                  color="success"
                  checked={isDone}
                  disabled={!canReceive || isSavingItem}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => handleToggleReceived(row)}
                />
              </span>
            </Tooltip>
          );
        },
      },
      {
        field: 'displayName',
        headerName: 'Producto',
        flex: 1,
        minWidth: 220,
        renderCell: ({ row, value }) => {
          const isDone = row.quantityReceived >= row.quantityOrdered;
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
              <Typography
                variant="body2"
                sx={{ textDecoration: isDone ? 'line-through' : 'none' }}
                color={isDone ? 'text.disabled' : 'text.primary'}
              >
                {value}
              </Typography>
            </Box>
          );
        },
      },
      // Sucursal del ítem: en órdenes externas consolidadas es la info que
      // diferencia cada línea (la orden junta varias sucursales). En las internas
      // todos los ítems son de la misma sucursal destino (igual se muestra).
      {
        field: 'branchName',
        headerName: 'Sucursal',
        width: 150,
        renderCell: ({ value }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" color={value ? 'text.primary' : 'text.disabled'}>
              {value || '—'}
            </Typography>
          </Box>
        ),
      },
      { field: 'categoryName', headerName: 'Rubro', width: 120 },
      {
        field: 'conditionName',
        headerName: 'Condición',
        width: 130,
        renderCell: ({ value }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            {value
              ? <Chip label={value} size="small" variant="outlined" color="info" />
              : <Typography variant="body2" color="text.disabled">—</Typography>}
          </Box>
        ),
      },
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
              sx={{ display: 'flex', alignItems: 'center', height: '100%', cursor: canReceive ? 'pointer' : 'default' }}
              onClick={() => canReceive && handleEditItem(row)}
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
      // Quitar ítem de la orden (admin/manager, orden no terminal). Rehabilita el
      // producto en su control de origen.
      ...(canDelete
        ? [{
            field: 'remove',
            headerName: '',
            width: 56,
            sortable: false,
            filterable: false,
            disableColumnMenu: true,
            align: 'center',
            headerAlign: 'center',
            renderCell: ({ row }) => (
              <Tooltip title="Quitar ítem de la orden" enterDelay={600}>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={!isOrderEditable}
                    onClick={(e) => { e.stopPropagation(); handleDeleteItem(row); }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            ),
          }]
        : []),
    ],
    [editingItemId, editingQty, isSavingItem, isOrderEditable, canReceive, canDelete, handleEditItem, handleSaveItemReceived, handleToggleReceived, handleDeleteItem]
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
      title={
        order
          ? order.isInternal
            ? `Orden #${order.id} — ${order.branchName} — ${order.period}`
            : `Orden #${order.id} — ${order.supplierName || 'Sin asignar'}`
          : 'Orden de Reposicion'
      }
      breadcrumbs={[
        { title: 'Ordenes de Reposicion', href: '/orders' },
        { title: `Orden #${order?.id}` },
      ]}
      actions={
        <Stack direction="row" spacing={1} alignItems="center">
          <ActionButton
            icon={<FileDownloadIcon />}
            color="primary"
            onClick={handleDownloadExcel}
            disabled={items.length === 0}
          >
            Descargar
          </ActionButton>
          {canReceive && hasPendingItems && (
            <ActionButton
              color="success"
              icon={<DoneAllIcon />}
              loading={isReceivingAll}
              onClick={handleReceiveAll}
            >
              Marcar todo recibido
            </ActionButton>
          )}
          {canDelete && (
            <ActionButton variant="danger" icon={<DeleteIcon />} onClick={handleDelete}>
              Eliminar
            </ActionButton>
          )}
          <ActionButton icon={<ArrowBackIcon />} onClick={backToList}>
            Volver
          </ActionButton>
        </Stack>
      }
    >
      {/* Header con estado y costo total */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} alignItems="center" flexWrap="wrap">
        <Chip
          label={getOrderStatusLabel(order.status)}
          color={getOrderStatusColor(order.status)}
        />
        <Chip
          variant="outlined"
          color={order.isInternal ? 'secondary' : 'default'}
          label={
            order.isInternal
              ? `Interna · ${order.sourceBranchName || 'Nodo Hub'}`
              : `Proveedor · ${order.supplierName || 'Sin asignar'}`
          }
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
        {order.createdAt && (
          <Typography variant="body2">
            Fecha: <strong>{new Date(order.createdAt).toLocaleDateString('es-ES')}</strong>
            {(() => {
              const days = getOrderElapsedDays(order);
              return days != null ? (
                <Chip
                  label={formatElapsedDays(days)}
                  size="small"
                  variant="outlined"
                  color={days >= 7 ? 'warning' : 'default'}
                  sx={{ ml: 1 }}
                />
              ) : null;
            })()}
          </Typography>
        )}
      </Stack>

      {/* Panel de cambio de estado — solo admin/manager */}
      {canEditStatus && isOrderEditable && (
        <Stack direction="row" spacing={2} sx={{ mb: 3 }} alignItems="flex-end">
          <Autocomplete
            size="small"
            options={ORDER_STATUS_OPTIONS}
            getOptionLabel={(o) => o.label}
            value={ORDER_STATUS_OPTIONS.find((s) => s.value === newStatus) || null}
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
          getRowClassName={(params) =>
            params.row.quantityReceived >= params.row.quantityOrdered ? 'row--received' : ''
          }
          sx={{
            ...dataGridSx,
            '& .row--received': { opacity: 0.55 },
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
