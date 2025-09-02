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
    dashboardDiv.style.display = 'block';
    
    // Mostrar nombre del usuario
    usernameSpan.textContent = user.username;
    
    console.log('Usuario autenticado:', user);
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
});