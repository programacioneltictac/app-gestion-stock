document.addEventListener("DOMContentLoaded", async () => {
  let currentUser = null;
  let availableBranches = [];

  const elements = {
    loading: document.getElementById("loading"),
    branchesApp: document.getElementById("branchesApp"),
    branchSelector: document.getElementById("branchSelector"),
    summarySection: document.getElementById("summarySection"),
    branchTitle: document.getElementById("branchTitle"),
    controlsTableBody: document.getElementById("controlsTableBody"),
  };

  await initializeApp();

  async function initializeApp() {
    try {
      const authResult = await verifyAuth();
      if (!authResult.success) {
        window.location.href = "/";
        return;
      }

      currentUser = authResult.user;

      // Mostrar nombre del usuario
      const usernameSpan = document.getElementById("username");
      if (usernameSpan) {
        usernameSpan.textContent = currentUser.username;
      }

      // Configurar menús del sidebar
      populateBranchesMenu(currentUser);
      populateStockMenu(currentUser);

      // Configurar event listeners
      setupEventListeners();

      await loadAvailableBranches();

      // Verificar si viene un parámetro de sucursal específica
      const urlParams = new URLSearchParams(window.location.search);
      const branchParam = urlParams.get("branch");

      if (branchParam) {
        await loadBranchSummary(parseInt(branchParam));
      } else {
        showBranchSelector();
      }

      elements.loading.style.display = "none";
      elements.branchesApp.style.display = "flex";
    } catch (error) {
      console.error("Error inicializando aplicación:", error);
      showMessage("Error cargando la aplicación", "error");
    }
  }

  async function verifyAuth() {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return { success: false };

      const response = await fetch("/api/verify-auth", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const result = await response.json();
        return { success: true, user: result.user };
      }

      return { success: false };
    } catch (error) {
      return { success: false };
    }
  }

  async function loadAvailableBranches() {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/stock/branches-list", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const result = await response.json();
        availableBranches = result.branches;
      }
    } catch (error) {
      console.error("Error cargando sucursales:", error);
    }
  }

  async function loadBranchSummary(branchId) {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/stock/branches-summary/${branchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const result = await response.json();
        displayBranchSummary(branchId, result);
      } else {
        showMessage("Error cargando resumen de sucursal", "error");
      }
    } catch (error) {
      console.error("Error cargando resumen:", error);
      showMessage("Error de conexión", "error");
    }
  }

  // Reemplazar showBranchSelector()
  function showBranchSelector() {
    document.getElementById("selectorView").style.display = "block";
    document.getElementById("summaryView").style.display = "none";

    const branchesGrid = document.getElementById("branchesGrid");
    branchesGrid.innerHTML = availableBranches
      .map(
        (branch) => `
      <div class="branch-card" onclick="loadBranchSummary(${branch.id})">
        <h4>${branch.name}</h4>
        <span class="branch-code">${branch.code}</span>
      </div>
    `
      )
      .join("");
  }

  // Reemplazar displayBranchSummary()
  function displayBranchSummary(branchId, data) {
    const branch = availableBranches.find((b) => b.id === branchId);

    document.getElementById("selectorView").style.display = "none";
    document.getElementById("summaryView").style.display = "block";

    document.getElementById("branchTitle").textContent = branch
      ? branch.name
      : "Sucursal";
    document.getElementById("totalControls").textContent =
      data.stats.total_controls;
    document.getElementById("completedControls").textContent =
      data.stats.completed_controls;
    document.getElementById("draftControls").textContent =
      data.stats.draft_controls;

    // Actualizar contador de items
    document.getElementById(
      "itemsCount"
    ).textContent = `${data.controls.length} controles`;

    displayControlsTable(data.controls);
  }

  // Mantener displayControlsTable() igual pero simplificar la estructura
  function displayControlsTable(controls) {
    const tbody = document.getElementById("controlsTableBody");
    tbody.innerHTML = "";

    if (controls.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="10" class="text-center">No hay controles registrados para esta sucursal</td></tr>';
      return;
    }

    controls.forEach((control) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>
          <strong>${control.control_month}/${control.control_year}</strong>
        </td>
        <td>
          <span class="status-badge status-${control.status}">
            ${control.status === "draft" ? "Borrador" : "Completado"}
          </span>
        </td>
        <td class="text-center">${control.total_items || 0}</td>
        <td class="text-center">${control.avg_compliance || 0}%</td>
        <td class="text-center">${control.need_order || 0}</td>
        <td class="text-center">${control.optimal_stock || 0}</td>
        <td class="text-center">${control.excess_stock || 0}</td>
        <td>${
          control.control_date
            ? new Date(control.control_date).toLocaleDateString()
            : "N/A"
        }</td>
        <td>
          <div style="display: flex; gap: 5px;">
            <a href="/stock.html?branch=${
              control.branch_id
            }" class="btn btn-primary btn-sm">
              Ver Detalle
            </a>
            ${
              currentUser && currentUser.role === "admin"
                ? `
              <button class="btn btn-danger btn-sm" onclick="deleteControl(${control.control_id})">
                Eliminar
              </button>
            `
                : ""
            }
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  async function deleteControl(controlId) {
    if (
      !confirm(
        "¿Estás seguro de eliminar este control? Esta acción eliminará el control y todos sus productos asociados. No se puede deshacer."
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/stock/monthly-control/${controlId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("Control eliminado exitosamente", "success");

        // Recargar los datos de la sucursal actual
        const urlParams = new URLSearchParams(window.location.search);
        const branchParam = urlParams.get("branch");
        if (branchParam) {
          await loadBranchSummary(parseInt(branchParam));
        }
      } else {
        showMessage(result.message, "error");
      }
    } catch (error) {
      console.error("Error eliminando control:", error);
      showMessage("Error de conexión", "error");
    }
  }

  function showMessage(message, type = "info") {
    const messageDiv = document.createElement("div");
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 4px;
      font-weight: 500;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      ${
        type === "error"
          ? "background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;"
          : "background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;"
      }
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
      messageDiv.remove();
    }, 5000);
  }

  // Agregar estas funciones después de showMessage()

  // Función para poblar menú de sucursales según rol
  function populateBranchesMenu(user) {
    const branchesNavBtn = document.getElementById("branchesNavBtn");
    const branchesSubmenu = document.getElementById("branchesSubmenu");

    if (branchesNavBtn && branchesSubmenu) {
      if (user.role === "admin" || user.role === "manager") {
        branchesNavBtn.style.display = "block";
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
      } else if (user.role === "employee") {
        branchesNavBtn.style.display = "block";
        branchesSubmenu.innerHTML = `
          <button onclick="goToBranchSummary(${user.branch_id})">${
          user.branch_name || "Sucursal asignada"
        }</button>
        `;
      } else {
        branchesNavBtn.style.display = "none";
      }
    }
  }

  // Función para poblar menú de sistema de stock
  function populateStockMenu(user) {
    const stockNavBtn = document.getElementById("stockNavBtn");
    const stockSubmenu = document.getElementById("stockSubmenu");

    if (stockNavBtn && stockSubmenu) {
      if (user.role === "admin" || user.role === "manager") {
        stockNavBtn.style.display = "block";
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
      } else if (user.role === "employee") {
        stockNavBtn.style.display = "block";
        stockSubmenu.innerHTML = `
          <button onclick="goToStock(${user.branch_id})">${
          user.branch_name || "Mi Sucursal"
        }</button>
        `;
      } else {
        stockNavBtn.style.display = "none";
      }
    }
  }

  // Función para navegar al resumen de sucursal específica
  function goToBranchSummary(branchId) {
    loadBranchSummary(branchId);
  }

  // Función para navegar al sistema de stock
  function goToStock(branchId) {
    window.location.href = `/stock.html?branch=${branchId}`;
  }

  // Función para manejar logout
  async function handleLogout() {
    const logoutBtn = document.getElementById("logoutBtn");
    const originalText = logoutBtn.textContent;
    logoutBtn.disabled = true;
    logoutBtn.textContent = "Cerrando...";

    try {
      const token = localStorage.getItem("authToken");
      if (token) {
        await fetch("/api/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
      }
    } catch (error) {
      console.error("Error en logout:", error);
    } finally {
      localStorage.removeItem("authToken");
      localStorage.removeItem("userData");
      sessionStorage.removeItem("redirecting");
      window.location.href = "/";
    }
  }

  // Configurar event listeners adicionales
  function setupEventListeners() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", handleLogout);
    }

    // Event listener para cerrar menús al hacer click fuera
    document.addEventListener("click", (e) => {
      const branchesSubmenu = document.getElementById("branchesSubmenu");
      const stockSubmenu = document.getElementById("stockSubmenu");
      const branchesBtn = document.getElementById("branchesNavBtn");
      const stockBtn = document.getElementById("stockNavBtn");

      if (
        branchesBtn &&
        branchesSubmenu &&
        !branchesBtn.contains(e.target) &&
        !branchesSubmenu.contains(e.target)
      ) {
        branchesSubmenu.classList.remove("show");
      }
      if (
        stockBtn &&
        stockSubmenu &&
        !stockBtn.contains(e.target) &&
        !stockSubmenu.contains(e.target)
      ) {
        stockSubmenu.classList.remove("show");
      }
    });
  }

  // Hacer funciones globales para que puedan ser llamadas desde onclick
  window.loadBranchSummary = loadBranchSummary;
  window.showBranchSelector = showBranchSelector;
  window.populateBranchesMenu = populateBranchesMenu;
  window.populateStockMenu = populateStockMenu;
  window.goToBranchSummary = goToBranchSummary;
  window.goToStock = goToStock;
  window.deleteControl = deleteControl;
});
