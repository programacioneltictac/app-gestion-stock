import branchService from '../services/branchService';

// Transform branch from backend
function transformBranchFromBackend(branch) {
  return {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    address: branch.address || '',
    phone: branch.phone || '',
    isActive: branch.is_active,
    isHub: branch.is_hub === true,
  };
}

export async function getBranches() {
  try {
    const data = await branchService.getAll();
    return (data.branches || []).map(transformBranchFromBackend);
  } catch (error) {
    console.error('Error fetching branches:', error);
    throw error;
  }
}

export async function getMyBranch() {
  try {
    const data = await branchService.getMyBranch();
    if (!data.branch) {
      return null;
    }
    return transformBranchFromBackend(data.branch);
  } catch (error) {
    console.error('Error fetching my branch:', error);
    throw error;
  }
}

// Evento global para que el sidebar recargue sus sucursales tras activar/desactivar.
export const BRANCHES_CHANGED_EVENT = 'branches-changed';

// Administración → Sucursales: todas, con lo que bloquea desactivarlas.
export async function getAdminBranches() {
  const data = await branchService.getAdminList();
  return (data.branches || []).map((b) => ({
    ...transformBranchFromBackend(b),
    apiBranchCode: b.api_branch_code || '',
    activeControls: Number(b.active_controls || 0),
    activeOrders: Number(b.active_orders || 0),
    usersCount: Number(b.users_count || 0),
  }));
}

export async function setBranchActive(branchId, isActive) {
  await branchService.setActive(branchId, isActive);
  window.dispatchEvent(new Event(BRANCHES_CHANGED_EVENT));
}

export async function getBranchesList() {
  try {
    const data = await branchService.getBranchesList();
    return (data.branches || []).map(transformBranchFromBackend);
  } catch (error) {
    console.error('Error fetching branches list:', error);
    throw error;
  }
}
