import userService from '../services/userService';

// Transform user from backend
function transformUserFromBackend(user) {
  return {
    id: user.id, // Backend devuelve 'id', no 'user_id'
    username: user.username,
    role: user.role,
    roleName: user.role_name || user.role,
    branchId: user.branch_id,
    branchName: user.branch_name || '',
    isActive: user.is_active,
    createdAt: user.created_at,
  };
}

// Transform user to backend format
function transformUserToBackend(user) {
  return {
    username: user.username,
    password: user.password,
    role: user.role,
    branch_id: user.branchId ? Number(user.branchId) : null,
  };
}

export async function getUsers() {
  try {
    const data = await userService.getAll();
    return (data.users || []).map(transformUserFromBackend);
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

export async function getUser(userId) {
  try {
    const data = await userService.getOne(userId);
    return transformUserFromBackend(data.user);
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
}

export async function createUser(userData) {
  try {
    const backendData = transformUserToBackend(userData);
    const response = await userService.create(backendData);
    return transformUserFromBackend(response.user);
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

export async function updateUser(userId, userData) {
  try {
    const backendData = transformUserToBackend(userData);
    const response = await userService.update(userId, backendData);
    return transformUserFromBackend(response.user);
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

export async function deleteUser(userId) {
  try {
    await userService.delete(userId);
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

export function validate(values) {
  const errors = {};

  if (!values.username || values.username.trim().length === 0) {
    errors.username = 'Usuario es requerido';
  } else if (values.username.length < 3) {
    errors.username = 'Usuario debe tener al menos 3 caracteres';
  }

  if (!values.role || values.role.trim().length === 0) {
    errors.role = 'Rol es requerido';
  }

  // Password is only required for new users
  if (values.password !== undefined) {
    if (!values.password || values.password.trim().length === 0) {
      errors.password = 'Contraseña es requerida';
    } else if (values.password.length < 4) {
      errors.password = 'Contraseña debe tener al menos 4 caracteres';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// User roles (hard-coded)
export function getUserRoles() {
  return [
    { id: 'admin', name: 'Administrador' },
    { id: 'manager', name: 'Gerente' },
    { id: 'employee', name: 'Empleado' },
  ];
}
