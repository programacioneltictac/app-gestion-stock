import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Autocomplete from '@mui/material/Autocomplete';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { DataGrid, GridActionsCellItem, gridClasses } from '@mui/x-data-grid';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { getOrders, getOrderStatusLabel, getOrderStatusColor } from '../data/orders';
import { getBranchesList } from '../data/branches';
import PageContainer from './PageContainer';

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

const ALL_STATUSES = ['pending', 'sent', 'partial', 'completed', 'cancelled'];

export default function OrderList() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [orders, setOrders] = React.useState([]);
  const [branches, setBranches] = React.useState([]);
  const [filterBranch, setFilterBranch] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const isEmployee = user?.role === 'employee';

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [ordersData, branchesData] = await Promise.all([
        getOrders(isEmployee ? user.branch_id : null),
        isEmployee ? Promise.resolve([]) : getBranchesList(),
      ]);
      setOrders(ordersData);
      setBranches(branchesData);
    } catch (err) {
      setError(err);
    }
    setIsLoading(false);
  }, [isEmployee, user]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredOrders = React.useMemo(() => {
    return orders.filter((o) => {
      if (filterBranch && String(o.branchId) !== String(filterBranch)) return false;
      if (filterStatus && o.status !== filterStatus) return false;
      return true;
    });
  }, [orders, filterBranch, filterStatus]);

  const handleRowView = React.useCallback(
    (order) => () => navigate(`/orders/${order.id}`),
    [navigate]
  );

  const columns = React.useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 70 },
      { field: 'branchName', headerName: 'Sucursal', flex: 1, minWidth: 130 },
      { field: 'period', headerName: 'Período', width: 110 },
      { field: 'totalItems', headerName: 'Items', width: 80, type: 'number' },
      { field: 'totalUnitsOrdered', headerName: 'Uds. pedidas', width: 110, type: 'number' },
      { field: 'totalUnitsReceived', headerName: 'Uds. recibidas', width: 120, type: 'number' },
      {
        field: 'totalCostEstimate',
        headerName: 'Costo estimado',
        width: 150,
        renderCell: ({ value }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" fontWeight={500}>
              {formatCurrency(value)}
            </Typography>
          </Box>
        ),
      },
      {
        field: 'status',
        headerName: 'Estado',
        width: 150,
        renderCell: ({ value }) => (
          <Chip
            label={getOrderStatusLabel(value)}
            color={getOrderStatusColor(value)}
            size="small"
          />
        ),
      },
      {
        field: 'createdAt',
        headerName: 'Fecha',
        width: 120,
        valueFormatter: (value) => value ? new Date(value).toLocaleDateString('es-ES') : '',
      },
      {
        field: 'actions',
        type: 'actions',
        headerName: '',
        width: 60,
        getActions: ({ row }) => [
          <GridActionsCellItem
            key="view"
            icon={<VisibilityIcon />}
            label="Ver detalle"
            onClick={handleRowView(row)}
          />,
        ],
      },
    ],
    [handleRowView]
  );

  return (
    <PageContainer
      title="Ordenes de Reposicion"
      breadcrumbs={[{ title: 'Ordenes de Reposicion' }]}
      actions={
        <Tooltip title="Recargar" placement="right" enterDelay={1000}>
          <div>
            <IconButton size="small" onClick={() => !isLoading && loadData()}>
              <RefreshIcon />
            </IconButton>
          </div>
        </Tooltip>
      }
    >
      {/* Filtros — solo para admin/manager */}
      {!isEmployee && (
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <Autocomplete
            size="small"
            options={branches}
            getOptionLabel={(o) => o.name || ''}
            value={branches.find((b) => String(b.id) === String(filterBranch)) || null}
            onChange={(_, val) => setFilterBranch(val ? val.id : '')}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(params) => <TextField {...params} label="Sucursal" />}
            sx={{ minWidth: 200 }}
          />
          <Autocomplete
            size="small"
            options={ALL_STATUSES}
            getOptionLabel={(s) => getOrderStatusLabel(s)}
            value={filterStatus || null}
            onChange={(_, val) => setFilterStatus(val || '')}
            renderInput={(params) => <TextField {...params} label="Estado" />}
            sx={{ minWidth: 200 }}
          />
        </Stack>
      )}

      {error ? (
        <Alert severity="error">{error.message}</Alert>
      ) : (
        <Box sx={{ flex: 1, width: '100%' }}>
          <DataGrid
            rows={filteredOrders}
            columns={columns}
            disableRowSelectionOnClick
            onRowClick={({ row }) => navigate(`/orders/${row.id}`)}
            loading={isLoading}
            autoHeight
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={{
              [`& .${gridClasses.columnHeader}, & .${gridClasses.cell}`]: { outline: 'transparent' },
              [`& .${gridClasses.columnHeader}:focus-within, & .${gridClasses.cell}:focus-within`]: { outline: 'none' },
              [`& .${gridClasses.row}:hover`]: { cursor: 'pointer' },
            }}
            slotProps={{
              loadingOverlay: { variant: 'circular-progress', noRowsVariant: 'circular-progress' },
            }}
          />
        </Box>
      )}
    </PageContainer>
  );
}
