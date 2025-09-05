document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  if (!form) return;

  // Verificar si ya hay un token válido al cargar la página
  checkExistingToken();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = form.username.value.trim();
    const password = form.password.value;

    // Validación básica
    if (!username || !password) {
      showMessage('Por favor, completa todos los campos', 'error');
      return;
    }

    // Deshabilitar botón durante la petición
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Ingresando...';

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const result = await response.json();

      if (response.ok && result.status === 'success') {
        console.log('Login successful, token received:', !!result.token);
        
        // Guardar token y datos del usuario en localStorage
        localStorage.setItem('authToken', result.token);
        localStorage.setItem('userData', JSON.stringify(result.user));
        
        showMessage('Login exitoso. Redirigiendo...', 'success');
        
        // Marcar que estamos redirigiendo
        sessionStorage.setItem('redirecting', 'true');
        
        console.log('Redirecting to /control...');
        // Redirigir inmediatamente sin delay
        window.location.href = '/control';
        
      } else {
        showMessage(result.message || 'Error en el login', 'error');
        console.log('Login failed, status:', response.status, 'message:', result.message);
        form.reset();
      }
    } catch (error) {
      console.error('Error:', error);
      showMessage('Error de conexión con el servidor', 'error');
    } finally {
      // Rehabilitar botón
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });

  // Función para verificar si ya existe un token válido
  async function checkExistingToken() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    // Evitar verificación si ya estamos en proceso de redirección
    if (sessionStorage.getItem('redirecting')) return;

    try {
      const response = await fetch('/api/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        // Marcar que estamos redirigiendo para evitar bucles
        sessionStorage.setItem('redirecting', 'true');
        
        // Token válido, redirigir a control
        window.location.href = '/control';
      } else {
        // Token inválido, limpiar storage pero NO redirigir
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        console.log('Token inválido, removido del storage');
      }
    } catch (error) {
      // Error de conexión, limpiar storage pero mantener en login
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
      console.log('Error de conexión, tokens removidos del storage');
    }
  }

  // Función para mostrar mensajes al usuario
  function showMessage(message, type) {
    // Remover mensaje anterior si existe
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
      existingMessage.remove();
    }

    // Crear elemento de mensaje
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
      padding: 10px;
      margin: 10px 0;
      border-radius: 4px;
      text-align: center;
      font-weight: 500;
      ${type === 'success' ? 
        'background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb;' : 
        'background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;'
      }
    `;

    // Insertar mensaje después del h2
    const h2 = form.querySelector('h2');
    h2.insertAdjacentElement('afterend', messageDiv);

    // Remover mensaje después de 5 segundos
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.remove();
      }
    }, 5000);
  }
});