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

export async function getBranchesList() {
  try {
    const data = await branchService.getBranchesList();
    return (data.branches || []).map(transformBranchFromBackend);
  } catch (error) {
    console.error('Error fetching branches list:', error);
    throw error;
  }
}
