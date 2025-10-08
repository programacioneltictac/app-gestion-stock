document.addEventListener('DOMContentLoaded', async () => {
  const loadingDiv = document.getElementById('loading');
  const dashboardDiv = document.getElementById('dashboard');
  const usernameSpan = document.getElementById('username');
  const logoutBtn = document.getElementById('logoutBtn');

  // Limpiar marca de redirección al llegar a control
  sessionStorage.removeItem('redirecting');

  // Verificar autenticación al cargar la página
  await verifyAuthentication();

  // Event listener para logout
  logoutBtn.addEventListener('click', handleLogout);

  // Event listener para cerrar menús al hacer click fuera
  document.addEventListener('click', (e) => {
    const branchesSubmenu = document.getElementById('branchesSubmenu');
    const stockSubmenu = document.getElementById('stockSubmenu');
    const branchesBtn = document.getElementById('branchesNavBtn');
    const stockBtn = document.getElementById('stockNavBtn');

    // Si el click no es en los botones o submenús, cerrar todos los menús
    if (!branchesBtn.contains(e.target) && !branchesSubmenu.contains(e.target)) {
      branchesSubmenu.classList.remove('show');
    }
    if (!stockBtn.contains(e.target) && !stockSubmenu.contains(e.target)) {
      stockSubmenu.classList.remove('show');
    }
  });

  async function verifyAuthentication() {
    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        console.log('No token found, redirecting to login');
        redirectToLogin();
        return;
      }

      // Verificar token con el servidor
      const response = await fetch('/api/verify-auth', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Authentication verified:', result);
        
        // Mostrar dashboard con información del usuario
        showDashboard(result.user);
      } else {
        console.log('Token verification failed, status:', response.status);
        // Token inválido o expirado
        cleanAuthData();
        redirectToLogin();
      }
    } catch (error) {
      console.error('Error verificando autenticación:', error);
      cleanAuthData();
      redirectToLogin();
    }
  }

  function showDashboard(user) {
    // Ocultar loading y mostrar dashboard
    loadingDiv.style.display = 'none';
    dashboardDiv.style.display = 'flex';

    // Mostrar nombre del usuario
    usernameSpan.textContent = user.username;

    // Guardar usuario globalmente para los menús
    window.currentUser = user;

    // Configurar menús según rol
    populateBranchesMenu(user);
    populateStockMenu(user);

    console.log('Usuario autenticado:', user);
  }

  function populateBranchesMenu(user) {
    const branchesNavBtn = document.getElementById('branchesNavBtn');
    const branchesSubmenu = document.getElementById('branchesSubmenu');

    if (branchesNavBtn && branchesSubmenu) {
      if (user.role === 'admin' || user.role === 'manager') {
        // Mostrar todas las sucursales para resumen
        branchesNavBtn.style.display = 'block';
        branchesSubmenu.innerHTML = `
          <button onclick="goToBranchSummary(1)">Casa Central</button>
          <button onclick="goToBranchSummary(2)">Boutique</button>
          <button onclick="goToBranchSummary(3)">Alvear</button>
          <button onclick="goToBranchSummary(4)">Castex</button>
          <button onclick="goToBranchSummary(5)">Luiggi</button>
          <button onclick="goToBranchSummary(6)">Impulso</button>
          <button onclick="goToBranchSummary(7)">Ingaramo</button>
          <button onclick="goToBranchSummary(8)">Santa Lucia</button>
        `;
      } else if (user.role === 'employee') {
        // Mostrar solo la sucursal asignada
        branchesNavBtn.style.display = 'block';
        branchesSubmenu.innerHTML = `
          <button onclick="goToBranchSummary(${user.branch_id})">${user.branch_name || 'Sucursal asignada'}</button>
        `;
      } else {
        // Ocultar menú si el rol no corresponde
        branchesNavBtn.style.display = 'none';
      }
    }
  }

  function populateStockMenu(user) {
    const stockNavBtn = document.getElementById('stockNavBtn');
    const stockSubmenu = document.getElementById('stockSubmenu');

    if (stockNavBtn && stockSubmenu) {
      if (user.role === 'admin' || user.role === 'manager') {
        // Admin y Manager pueden ver todas las sucursales
        stockNavBtn.style.display = 'block';
        stockSubmenu.innerHTML = `
          <button onclick="goToStock(1)">Casa Central</button>
          <button onclick="goToStock(2)">Boutique</button>
          <button onclick="goToStock(3)">Alvear</button>
          <button onclick="goToStock(4)">Castex</button>
          <button onclick="goToStock(5)">Luiggi</button>
          <button onclick="goToStock(6)">Impulso</button>
          <button onclick="goToStock(7)">Ingaramo</button>
          <button onclick="goToStock(8)">Santa Lucia</button>
        `;
      } else if (user.role === 'employee') {
        // Employee solo ve su sucursal
        stockNavBtn.style.display = 'block';
        stockSubmenu.innerHTML = `
          <button onclick="goToStock(${user.branch_id})">${user.branch_name || 'Mi Sucursal'}</button>
        `;
      } else {
        // Ocultar menú si el rol no corresponde
        stockNavBtn.style.display = 'none';
      }
    }
  }

  // Función para ir a una sucursal específica (para futuras funcionalidades)
  function goToBranch(branchId) {
    console.log('Navegando a sucursal:', branchId);
    // Aquí se puede implementar navegación específica por sucursal
    showMessage(`Navegando a ${getBranchName(branchId)}`, 'info');
  }

  // Función para navegar al sistema de stock
  function goToStock(branchId) {
    window.location.href = `/stock.html?branch=${branchId}`;
  }

  // Función para navegar al resumen de sucursal específica
  function goToBranchSummary(branchId) {
    window.location.href = `/branches-summary.html?branch=${branchId}`;
  }

  // Función para obtener nombre de sucursal
  function getBranchName(branchId) {
    const branches = {
      1: 'Casa Central',
      2: 'Boutique',
      3: 'Alvear', 
      4: 'Castex',
      5: 'Luiggi',
      6: 'Impulso',
      7: 'Ingaramo',
      8: 'Santa Lucia'
    };
    return branches[branchId] || 'Sucursal';
  }

  async function handleLogout() {
    const originalText = logoutBtn.textContent;
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Cerrando...';

    try {
      // Llamar al endpoint de logout (opcional)
      const token = localStorage.getItem('authToken');
      if (token) {
        await fetch('/api/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      console.error('Error en logout:', error);
    } finally {
      // Limpiar datos locales y redirigir
      cleanAuthData();
      showLogoutMessage();
      
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    }
  }

  function cleanAuthData() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    sessionStorage.removeItem('redirecting');
  }

  function redirectToLogin() {
    window.location.href = '/';
  }

  function showLogoutMessage() {
    // Crear mensaje de logout
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
      padding: 15px 20px;
      border-radius: 4px;
      font-weight: 500;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
    messageDiv.textContent = 'Sesión cerrada exitosamente. Redirigiendo...';
    document.body.appendChild(messageDiv);
  }

  function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 4px;
      font-weight: 500;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      ${type === 'info' ? 
        'background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;' :
        type === 'success' ?
        'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;' :
        'background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;'
      }
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
      messageDiv.remove();
    }, 3000);
  }

  // Función para manejar la navegación del navegador
  window.addEventListener('beforeunload', () => {
    // Aquí se podría implementar lógica adicional antes de cerrar la pestaña
  });

  // Verificar periódicamente si el token sigue siendo válido
  setInterval(async () => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
      const response = await fetch('/api/verify-auth', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        cleanAuthData();
        redirectToLogin();
      }
    } catch (error) {
      // Error de conexión, mantener sesión pero loggear el error
      console.error('Error verificando token periódicamente:', error);
    }
  }, 5 * 60 * 1000); // Verificar cada 5 minutos

  // Hacer funciones globales
  window.goToBranch = goToBranch;
  window.goToStock = goToStock;
  window.goToBranchSummary = goToBranchSummary;        // ← AGREGAR
  window.populateBranchesMenu = populateBranchesMenu;  // ← AGREGAR
  window.populateStockMenu = populateStockMenu;        // ← AGREGAR
});