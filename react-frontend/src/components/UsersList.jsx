import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import { DataGrid, GridActionsCellItem, gridClasses } from "@mui/x-data-grid";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate } from "react-router";
import { useDialogs } from "../hooks/useDialogs/useDialogs";
import useNotifications from "../hooks/useNotifications/useNotifications";
import { getUsers, deleteUser } from "../data/users";
import PageContainer from "./PageContainer";

export default function UsersList() {
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const notifications = useNotifications();

  const [users, setUsers] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const data = await getUsers();
      setUsers(data);
    } catch (loadError) {
      setError(loadError);
    }

    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = React.useCallback(() => {
    if (!isLoading) {
      loadData();
    }
  }, [isLoading, loadData]);

  const handleCreate = React.useCallback(() => {
    navigate("/users/new");
  }, [navigate]);

  const handleEdit = React.useCallback(
    (user) => () => {
      navigate(`/users/${user.id}/edit`);
    },
    [navigate]
  );

  const handleDelete = React.useCallback(
    (user) => async () => {
      const confirmed = await dialogs.confirm(
        `¿Deseas eliminar el usuario ${user.username}?`,
        {
          title: "¿Eliminar usuario?",
          severity: "error",
          okText: "Eliminar",
          cancelText: "Cancelar",
        }
      );

      if (confirmed) {
        try {
          await deleteUser(user.id);
          notifications.show("Usuario eliminado exitosamente", {
            severity: "success",
            autoHideDuration: 3000,
          });
          loadData();
        } catch (deleteError) {
          notifications.show(`Error al eliminar: ${deleteError.message}`, {
            severity: "error",
            autoHideDuration: 3000,
          });
        }
      }
    },
    [dialogs, notifications, loadData]
  );

  const getRoleColor = React.useCallback((role) => {
    switch (role) {
      case "admin":
        return "error";
      case "manager":
        return "warning";
      case "employee":
        return "info";
      default:
        return "default";
    }
  }, []);

  const columns = React.useMemo(
    () => [
      { field: "id", headerName: "ID", width: 70 },
      { field: "username", headerName: "Usuario", flex: 1, minWidth: 150 },
      {
        field: "role",
        headerName: "Rol",
        width: 140,
        renderCell: (params) => (
          <Chip
            label={params.row.roleName || params.value}
            color={getRoleColor(params.value)}
            size="small"
          />
        ),
      },
      { field: "branchName", headerName: "Sucursal", width: 150 },
      {
        field: "isActive",
        headerName: "Estado",
        width: 100,
        renderCell: (params) => (
          <Chip
            label={params.value ? "Activo" : "Inactivo"}
            color={params.value ? "success" : "default"}
            size="small"
          />
        ),
      },
      {
        field: "createdAt",
        headerName: "Fecha Creación",
        width: 150,
        valueFormatter: (value) => {
          if (!value) return "";
          return new Date(value).toLocaleDateString("es-ES");
        },
      },
      {
        field: "actions",
        type: "actions",
        headerName: "Acciones",
        width: 100,
        getActions: ({ row }) => [
          <GridActionsCellItem
            key="edit-user"
            icon={<EditIcon />}
            label="Editar"
            onClick={handleEdit(row)}
          />,
          <GridActionsCellItem
            key="delete-user"
            icon={<DeleteIcon />}
            label="Eliminar"
            onClick={handleDelete(row)}
          />,
        ],
      },
    ],
    [getRoleColor, handleEdit, handleDelete]
  );

  const pageTitle = "Usuarios";

  return (
    <PageContainer
      title={pageTitle}
      breadcrumbs={[{ title: pageTitle }]}
      actions={
        <Stack direction="row" alignItems="center" spacing={1}>
          <Tooltip title="Recargar datos" placement="right" enterDelay={1000}>
            <IconButton
              size="small"
              aria-label="refresh"
              onClick={handleRefresh}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            onClick={handleCreate}
            startIcon={<AddIcon />}
          >
            Crear
          </Button>
        </Stack>
      }
    >
      <Box sx={{ flex: 1, width: "100%" }}>
        {error ? (
          <Alert severity="error">{error.message}</Alert>
        ) : (
          <DataGrid
            rows={users}
            columns={columns}
            disableRowSelectionOnClick
            loading={isLoading}
            autoHeight
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
            }}
            sx={{
              [`& .${gridClasses.columnHeader}, & .${gridClasses.cell}`]: {
                outline: "transparent",
              },
              [`& .${gridClasses.columnHeader}:focus-within, & .${gridClasses.cell}:focus-within`]:
                {
                  outline: "none",
                },
            }}
          />
        )}
      </Box>
    </PageContainer>
  );
}
