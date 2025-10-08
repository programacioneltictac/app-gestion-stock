// stock-frontend.js - Frontend Sistema de Stock ACTUALIZADO
document.addEventListener("DOMContentLoaded", async () => {
  // Variables globales
  let currentUser = null;
  let currentControl = null;
  let currentBranchId = null;
  let currentPage = 1;
  let totalPages = 1;
  let currentFilters = {};
  let catalogData = {
    products: [],
    categories: [],
    conditions: [],
    productStatus: [],
  };

  // Elementos DOM
  const elements = {
    loading: document.getElementById("loading"),
    stockApp: document.getElementById("stockApp"),
    controlTitle: document.getElementById("controlTitle"),
    branchName: document.getElementById("branchName"),
    controlPeriod: document.getElementById("controlPeriod"),
    controlStatus: document.getElementById("controlStatus"),
    createControlBtn: document.getElementById("createControlBtn"),
    saveControlBtn: document.getElementById("saveControlBtn"),
    completeControlBtn: document.getElementById("completeControlBtn"),
    statsSection: document.getElementById("statsSection"),
    formSection: document.getElementById("formSection"),
    filtersSection: document.getElementById("filtersSection"),
    tableSection: document.getElementById("tableSection"),
    messageContainer: document.getElementById("messageContainer"),
    addProductForm: document.getElementById("addProductForm"),
    productsTableBody: document.getElementById("productsTableBody"),
    pagination: document.getElementById("pagination"),
    itemsCount: document.getElementById("itemsCount"),
  };

  // Inicialización
  await initializeApp();

  // ==================== FUNCIONES DE INICIALIZACIÓN ====================

  async function initializeApp() {
    try {
      // Verificar autenticación
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

      // Obtener parámetros de URL para la sucursal
      const urlParams = new URLSearchParams(window.location.search);
      const branchParam = urlParams.get("branch");

      // Determinar sucursal según rol
      if (currentUser.role === "employee") {
        currentBranchId = currentUser.branch_id;
      } else if (branchParam) {
        currentBranchId = parseInt(branchParam);
      } else {
        // Si es admin/manager sin sucursal específica, mostrar selector
        showBranchSelector();
        return;
      }

      // Cargar datos de catálogos
      await loadCatalogs();

      // Cargar control actual
      await loadCurrentControl();

      // Configurar menús del sidebar
      populateBranchesMenu(currentUser);
      populateStockMenu(currentUser);

      // Configurar event listeners
      setupEventListeners();

      // Mostrar aplicación
      elements.loading.style.display = "none";
      elements.stockApp.style.display = "flex";
    } catch (error) {
      console.error("Error inicializando aplicación:", error);
      showMessage("Error inicializando la aplicación", "error");
    }
  }

  async function verifyAuth() {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        return { success: false };
      }

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

  async function loadCatalogs() {
    try {
      const token = localStorage.getItem("authToken");

      // Cargar productos
      const productsResponse = await fetch(
        "/api/stock/catalogs/products?limit=1000",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (productsResponse.ok) {
        const productsResult = await productsResponse.json();
        catalogData.products = productsResult.products;
        setupProductAutocomplete();
      }

      // Cargar categorías
      const categoriesResponse = await fetch("/api/stock/catalogs/categories", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (categoriesResponse.ok) {
        const categoriesResult = await categoriesResponse.json();
        catalogData.categories = categoriesResult.categories;
        populateCategorySelect();
        populateCategoryFilter();
      }

      // Cargar condiciones
      const conditionsResponse = await fetch("/api/stock/catalogs/conditions", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (conditionsResponse.ok) {
        const conditionsResult = await conditionsResponse.json();
        catalogData.conditions = conditionsResult.conditions;
        populateConditionSelect();
        populateConditionFilter();
      }

      // Simular estados de producto (hasta que tengas la tabla products_status)
      catalogData.productStatus = [
        { id: 1, product_status_name: "Activo" },
        { id: 2, product_status_name: "Inactivo" },
        { id: 3, product_status_name: "Prueba" },
      ];
      populateProductStatusSelect();
      populateProductStatusFilter(); // ✅ AGREGADO: Poblar el filtro también
    } catch (error) {
      console.error("Error cargando catálogos:", error);
    }
  }

  async function loadCurrentControl() {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `/api/stock/monthly-control/current?branch_id=${currentBranchId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const result = await response.json();

        if (result.control) {
          currentControl = result.control;
          updateControlDisplay();
          updateStatsDisplay(result.stats);
          showControlSections();
          await loadControlItems();
        } else {
          showCreateControlOption(result.period);
        }
      } else {
        showMessage("Error cargando control actual", "error");
      }
    } catch (error) {
      console.error("Error cargando control:", error);
      showMessage("Error de conexión", "error");
    }
  }

  // ==================== FUNCIONES DE UI ====================

  function updateControlDisplay() {
    const branchDisplayName =
      currentUser.role === "employee"
        ? currentUser.branch_name
        : getBranchNameById(currentBranchId);

    elements.controlTitle.textContent = "Control de Stock";
    elements.branchName.textContent = branchDisplayName || "Sucursal";
    elements.controlPeriod.textContent = `${currentControl.control_month}/${currentControl.control_year}`;
    elements.controlStatus.textContent =
      currentControl.status === "draft" ? "Borrador" : "Completado";
  }

  function updateStatsDisplay(stats) {
    if (!stats) return;

    document.getElementById("totalItems").textContent = stats.total_items || 0;
    document.getElementById("needOrderItems").textContent =
      stats.need_order || 0;
    document.getElementById("optimalItems").textContent = stats.optimal || 0;
    document.getElementById("excessItems").textContent = stats.excess || 0;
    document.getElementById("avgCompliance").textContent = `${
      stats.avg_compliance || 0
    }%`;
  }

  function showControlSections() {
    elements.statsSection.classList.remove("hidden");

    if (currentControl.status === "draft") {
      elements.formSection.classList.remove("hidden");
      elements.saveControlBtn.classList.remove("hidden");
      elements.completeControlBtn.classList.remove("hidden");
    }

    elements.filtersSection.classList.remove("hidden");
    elements.tableSection.classList.remove("hidden");
  }

  function showCreateControlOption(period) {
    elements.controlTitle.textContent = "Crear Nuevo Control";
    elements.branchName.textContent =
      getBranchNameById(currentBranchId) || "Sucursal";
    elements.controlPeriod.textContent = `${period.month}/${period.year}`;
    elements.controlStatus.textContent = "No existe";
    elements.createControlBtn.classList.remove("hidden");
  }

  function showBranchSelector() {
    // Implementar selector de sucursal para admin/manager
    const branchOptions = [
      { id: 1, name: "Casa Central" },
      { id: 2, name: "Boutique" },
      { id: 3, name: "Alvear" },
      { id: 4, name: "Castex" },
      { id: 5, name: "Luiggi" },
      { id: 6, name: "Impulso" },
      { id: 7, name: "Ingaramo" },
      { id: 8, name: "Santa Lucia" },
    ];

    let selectorHTML =
      '<div class="branch-selector"><h3>Seleccionar Sucursal</h3>';
    branchOptions.forEach((branch) => {
      selectorHTML += `<button class="btn btn-primary" onclick="selectBranch(${branch.id})">${branch.name}</button>`;
    });
    selectorHTML += "</div>";

    elements.stockApp.innerHTML = selectorHTML;
    elements.stockApp.style.display = "block";
    elements.loading.style.display = "none";
  }

  function getBranchNameById(branchId) {
    const branches = {
      1: "Casa Central",
      2: "Boutique",
      3: "Alvear",
      4: "Castex",
      5: "Luiggi",
      6: "Impulso",
      7: "Ingaramo",
      8: "Santa Lucia",
    };
    return branches[branchId];
  }

  // Funcionalidad de autocompletado de productos
  function setupProductAutocomplete() {
    const productInput = document.getElementById("productInput");
    const selectedProductId = document.getElementById("selectedProductId");
    const suggestionsDiv = document.getElementById("productSuggestions");

    let currentSuggestions = [];
    let highlightedIndex = -1;

    // Manejar input del usuario
    productInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();

      if (query.length < 2) {
        hideSuggestions();
        selectedProductId.value = "";
        return;
      }

      showProductSuggestions(query);
    });

    // Manejar teclas de navegación
    productInput.addEventListener("keydown", (e) => {
      if (
        !suggestionsDiv.style.display ||
        suggestionsDiv.style.display === "none"
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          highlightedIndex = Math.min(
            highlightedIndex + 1,
            currentSuggestions.length - 1
          );
          updateHighlight();
          break;
        case "ArrowUp":
          e.preventDefault();
          highlightedIndex = Math.max(highlightedIndex - 1, -1);
          updateHighlight();
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0 && currentSuggestions[highlightedIndex]) {
            selectProduct(currentSuggestions[highlightedIndex]);
          }
          break;
        case "Escape":
          hideSuggestions();
          break;
      }
    });

    // Ocultar sugerencias al hacer click fuera
    document.addEventListener("click", (e) => {
      if (
        !productInput.contains(e.target) &&
        !suggestionsDiv.contains(e.target)
      ) {
        hideSuggestions();
      }
    });

    function showProductSuggestions(query) {
      const matches = catalogData.products
        .filter(
          (product) =>
            product.product_name.toLowerCase().includes(query) ||
            product.product_code.toLowerCase().includes(query)
        )
        .slice(0, 10); // Limitar a 10 resultados

      currentSuggestions = matches;
      highlightedIndex = -1;

      if (matches.length === 0) {
        hideSuggestions();
        return;
      }

      suggestionsDiv.innerHTML = matches
        .map(
          (product) => `
        <div class="suggestion-item" data-product-id="${product.id}">
          <strong>${highlightMatch(product.product_name, query)}</strong>
          <small>${product.product_code} ${
            product.description ? "- " + product.description : ""
          }</small>
        </div>
      `
        )
        .join("");

      // Agregar event listeners a cada sugerencia
      suggestionsDiv
        .querySelectorAll(".suggestion-item")
        .forEach((item, index) => {
          item.addEventListener("click", () => {
            selectProduct(matches[index]);
          });
        });

      suggestionsDiv.style.display = "block";
    }

    function highlightMatch(text, query) {
      const regex = new RegExp(`(${query})`, "gi");
      return text.replace(regex, "<mark>$1</mark>");
    }

    function updateHighlight() {
      suggestionsDiv
        .querySelectorAll(".suggestion-item")
        .forEach((item, index) => {
          item.classList.toggle("highlighted", index === highlightedIndex);
        });
    }

    function selectProduct(product) {
      productInput.value = `${product.product_name} (${product.product_code})`;
      selectedProductId.value = product.id;
      hideSuggestions();
    }

    function hideSuggestions() {
      suggestionsDiv.style.display = "none";
      highlightedIndex = -1;
      currentSuggestions = [];
    }
  }

  function populateCategorySelect() {
    const select = document.getElementById("categorySelect");
    if (!select) {
      console.error("Elemento categorySelect no encontrado");
      return;
    }

    select.innerHTML = '<option value="">Seleccionar categoría...</option>';

    catalogData.categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.category_name;
      select.appendChild(option);
    });
  }

  function populateConditionSelect() {
    const select = document.getElementById("conditionSelect");
    if (!select) {
      console.error("Elemento conditionSelect no encontrado");
      return;
    }

    select.innerHTML = '<option value="">Seleccionar condición...</option>';

    catalogData.conditions.forEach((condition) => {
      const option = document.createElement("option");
      option.value = condition.id;
      option.textContent = condition.condition_name;
      select.appendChild(option);
    });
  }

  function populateProductStatusSelect() {
    const select = document.getElementById("productStatusSelect");
    if (!select) {
      console.error("Elemento productStatusSelect no encontrado");
      return;
    }

    select.innerHTML =
      '<option value="1">Activo</option><option value="2">Inactivo</option><option value="3">Prueba</option>';
  }

  function populateCategoryFilter() {
    const select = document.getElementById("categoryFilter");
    select.innerHTML = '<option value="">Todas las categorías</option>';

    catalogData.categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.category_name;
      select.appendChild(option);
    });
  }

  function populateConditionFilter() {
    const select = document.getElementById("conditionFilter");
    select.innerHTML = '<option value="">Todas las condiciones</option>';

    catalogData.conditions.forEach((condition) => {
      const option = document.createElement("option");
      option.value = condition.id;
      option.textContent = condition.condition_name;
      select.appendChild(option);
    });
  }

  function populateProductStatusFilter() {
    const select = document.getElementById("productStatusFilter");
    if (!select) {
      console.error("Elemento productStatusFilter no encontrado");
      return;
    }

    select.innerHTML = '<option value="">Todos los estados</option>';

    catalogData.productStatus.forEach((status) => {
      const option = document.createElement("option");
      option.value = status.id;
      option.textContent =
        status.product_status_name || status.name || `Estado ${status.id}`;
      select.appendChild(option);
    });
  }

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
    window.location.href = `/branches-summary.html?branch=${branchId}`;
  }

  // Función para navegar al sistema de stock
  function goToStock(branchId) {
    window.location.href = `/stock.html?branch=${branchId}`;
  }

  // ==================== FUNCIONES DE DATOS ====================

  async function createControl() {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/stock/monthly-control/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ branch_id: currentBranchId }),
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("Control creado exitosamente", "success");
        await loadCurrentControl();
      } else {
        showMessage(result.message, "error");
      }
    } catch (error) {
      console.error("Error creando control:", error);
      showMessage("Error de conexión", "error");
    }
  }

  async function saveControl() {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/stock/monthly-control/save", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ control_id: currentControl.id }),
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("Control guardado exitosamente", "success");
      } else {
        showMessage(result.message, "error");
      }
    } catch (error) {
      console.error("Error guardando control:", error);
      showMessage("Error de conexión", "error");
    }
  }

  async function completeControl() {
    if (
      !confirm(
        "¿Estás seguro de completar este control? No podrás editarlo después."
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/stock/monthly-control/complete", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ control_id: currentControl.id }),
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("Control completado exitosamente", "success");
        await loadCurrentControl();
      } else {
        showMessage(result.message, "error");
      }
    } catch (error) {
      console.error("Error completando control:", error);
      showMessage("Error de conexión", "error");
    }
  }

  async function addProduct(formData) {
    try {
      console.log("Agregando producto...", formData); // Debug

      const token = localStorage.getItem("authToken");
      const requestData = {
        monthly_control_id: currentControl.id,
        product_id: parseInt(formData.product_id),
        category_id: parseInt(formData.category_id),
        condition_id: parseInt(formData.condition_id),
        product_status_id: parseInt(formData.product_status_id) || 1,
        stock_require: parseInt(formData.stock_require),
        stock_current: parseInt(formData.stock_current),
        notes: formData.notes || null,
      };

      console.log("Request data:", requestData); // Debug

      const response = await fetch("/api/stock/items/add", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      console.log("Response:", response.status, result); // Debug

      if (response.ok) {
        showMessage("Producto agregado exitosamente", "success");
        elements.addProductForm.reset();
        await loadCurrentControl();
        await loadControlItems();
      } else {
        showMessage(result.message || "Error agregando producto", "error");
      }
    } catch (error) {
      console.error("Error agregando producto:", error);
      showMessage("Error de conexión", "error");
    }
  }

  // ==================== CORRECCIÓN EN loadControlItems ====================
  async function loadControlItems(page = 1) {
    if (!currentControl) return;

    try {
      const token = localStorage.getItem("authToken");

      // ✅ CORREGIDO: Filtrar propiedades undefined
      const cleanFilters = Object.fromEntries(
        Object.entries(currentFilters).filter(
          ([_, value]) => value !== undefined && value !== ""
        )
      );

      const params = new URLSearchParams({
        page: page,
        limit: 50,
        ...cleanFilters,
      });

      const response = await fetch(
        `/api/stock/items/${currentControl.id}?${params}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const result = await response.json();
        displayItems(result.items);
        updatePagination(result.pagination);
        elements.itemsCount.textContent = `${result.pagination.total} productos`;
        currentPage = page;
        totalPages = result.pagination.pages;
      } else {
        showMessage("Error cargando productos", "error");
      }
    } catch (error) {
      console.error("Error cargando items:", error);
      showMessage("Error de conexión", "error");
    }
  }

  // ==================== CORRECCIÓN EN updateProduct ====================
  async function updateProduct(itemId, stockRequire, stockCurrent, notes) {
    console.log("updateProduct llamado:", {
      itemId,
      stockRequire,
      stockCurrent,
      notes,
    });
    try {
      const token = localStorage.getItem("authToken");

      const response = await fetch(`/api/stock/items/${itemId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: 1, // Valor requerido por el middleware actual
          stock_require: parseInt(stockRequire),
          stock_current: parseInt(stockCurrent),
          notes: notes || null,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("Producto actualizado exitosamente", "success");
        await loadCurrentControl();
        await loadControlItems(currentPage);
      } else {
        showMessage(result.message, "error");
      }
    } catch (error) {
      console.error("Error actualizando producto:", error);
      showMessage("Error de conexión", "error");
    }
  }

  async function deleteProduct(itemId) {
    if (!confirm("¿Estás seguro de eliminar este producto del control?")) {
      return;
    }

    console.log("deleteProduct llamado:", { itemId });

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/stock/items/${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("Producto eliminado exitosamente", "success");
        await loadCurrentControl();
        await loadControlItems(currentPage);
      } else {
        showMessage(result.message, "error");
      }
    } catch (error) {
      console.error("Error eliminando producto:", error);
      showMessage("Error de conexión", "error");
    }
  }

  async function updateProductStatus(itemId, productStatusId) {
    console.log("updateProduct llamado:", { itemId, productStatusId });
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/stock/items/${itemId}/status`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ product_status_id: parseInt(productStatusId) }),
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("Estado del producto actualizado exitosamente", "success");
        await loadControlItems(currentPage);
      } else {
        showMessage(result.message || "Error actualizando estado", "error");
      }
    } catch (error) {
      console.error("Error actualizando estado del producto:", error);
      showMessage("Error de conexión", "error");
    }
  }

  // ==================== FUNCIONES DE VISUALIZACIÓN ====================

  function displayItems(items) {
    const tbody = elements.productsTableBody;
    tbody.innerHTML = "";

    if (items.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="text-center">No hay productos en este control</td></tr>';
      return;
    }

    items.forEach((item) => {
      const row = createItemRow(item);
      tbody.appendChild(row);
    });
  }

  // ==================== CORRECCIONES EN createItemRow ====================
  function createItemRow(item) {
    const row = document.createElement("tr");

    const stockDifferenceClass =
      item.stock_difference >= 0
        ? "compliance-positive"
        : "compliance-negative";
    const complianceClass =
      item.stock_compliance >= 80
        ? "compliance-positive"
        : "compliance-negative";

    row.innerHTML = `
      <td>
        <strong>${item.product_name}</strong><br>
        <small>${item.product_code || ""}</small>
      </td>
      <td>${item.category_name || "Sin categoría"}</td>
      <td>${item.condition_name || "Sin condición"}</td>
      <td class="editable-status-cell" data-field="product_status_id" data-item-id="${
        item.id
      }">
        ${item.product_status_name || "Activo"}
      </td>
      <td class="editable-cell" data-field="stock_require" data-item-id="${
        item.id
      }">${item.stock_require}</td>
      <td class="editable-cell" data-field="stock_current" data-item-id="${
        item.id
      }">${item.stock_current}</td>
      <td class="${stockDifferenceClass}">${
      item.stock_difference > 0 ? "+" : ""
    }${item.stock_difference}</td>
      <td class="${complianceClass}">${item.stock_compliance}%</td>
      <td>
        <span class="status-badge status-${
          item.stock_status_name || "stock_optimo"
        }">
          ${getStatusDisplayName(item.stock_status_name)}
        </span>
      </td>
      <td>
        ${
          currentControl.status === "draft"
            ? `
          <button class="btn btn-danger" onclick="deleteProduct(${item.id})" style="padding: 4px 8px; font-size: 12px;">
            Eliminar
          </button>
        `
            : "-"
        }
      </td>
    `;

    // Agregar funcionalidad de edición en línea para celdas editables
    if (currentControl.status === "draft") {
      const editableCells = row.querySelectorAll(".editable-cell");
      editableCells.forEach((cell) => {
        const field = cell.dataset.field;

        // Solo permitir editar stock_require si el usuario es admin
        if (field === "stock_require" && currentUser.role !== "admin") {
          return; // Saltar esta celda, no agregar funcionalidad de edición
        }

        cell.style.cursor = "pointer";
        cell.addEventListener("click", () => makeEditable(cell, item));
      });

      // ✅ AGREGADO: Funcionalidad para celdas de estado del producto
      const statusCells = row.querySelectorAll(".editable-status-cell");
      statusCells.forEach((cell) => {
        const field = cell.dataset.field;

        if (field === "product_status_id" && currentUser.role !== "admin") {
          return; // Saltar esta celda, no agregar funcionalidad de edición
        }

        cell.style.cursor = "pointer";
        cell.addEventListener("click", () => makeStatusEditable(cell, item));
      });
    }

    return row;
  }

  function makeEditable(cell, item) {
    const field = cell.dataset.field;
    const itemId = cell.dataset.itemId;
    const currentValue = cell.textContent.trim();

    const input = document.createElement("input");
    input.type = "number";
    input.value = currentValue;
    input.min = "0";
    input.style.width = "80px";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "✓";
    saveBtn.className = "btn btn-success";
    saveBtn.style.padding = "2px 6px";
    saveBtn.style.marginLeft = "5px";
    saveBtn.style.fontSize = "12px";

    cell.innerHTML = "";
    cell.appendChild(input);
    cell.appendChild(saveBtn);

    // Prevenir propagación en todos los eventos del input
    input.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    input.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    input.addEventListener("mouseup", (e) => {
      e.stopPropagation();
    });

    input.focus();
    input.select();

    const save = async () => {
      const newValue = parseInt(input.value);
      if (isNaN(newValue) || newValue < 0) {
        showMessage("Valor inválido", "error");
        return;
      }

      const updateData = {
        stock_require:
          field === "stock_require" ? newValue : item.stock_require,
        stock_current:
          field === "stock_current" ? newValue : item.stock_current,
      };

      await updateProduct(
        itemId,
        updateData.stock_require,
        updateData.stock_current,
        item.notes
      );
    };

    const cancel = () => {
      cell.textContent = currentValue;
    };

    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      save();
    });

    input.addEventListener("keydown", (e) => {
      e.stopPropagation();

      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });

    // Cancelar si se hace click fuera del elemento
    const handleClickOutside = (e) => {
      if (!cell.contains(e.target)) {
        cancel();
        document.removeEventListener("click", handleClickOutside);
      }
    };

    // Agregar el listener después de un pequeño delay
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 100);
  }

  // Agregar esta función después de makeEditable:
  function makeStatusEditable(cell, item) {
    const itemId = cell.dataset.itemId;
    const currentValue = item.product_status_id || 1;
    const currentText = cell.textContent.trim();

    const select = document.createElement("select");
    select.innerHTML = `
      <option value="1" ${currentValue == 1 ? "selected" : ""}>Activo</option>
      <option value="2" ${currentValue == 2 ? "selected" : ""}>Inactivo</option>
      <option value="3" ${currentValue == 3 ? "selected" : ""}>Prueba</option>
    `;

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "✓";
    saveBtn.className = "btn btn-success";
    saveBtn.style.padding = "2px 6px";
    saveBtn.style.marginLeft = "5px";
    saveBtn.style.fontSize = "12px";

    cell.innerHTML = "";
    cell.appendChild(select);
    cell.appendChild(saveBtn);

    // Prevenir que el click se propague y cierre el select
    select.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    select.focus();

    const save = async () => {
      await updateProductStatus(itemId, select.value);
    };

    const cancel = () => {
      cell.textContent = currentText;
    };

    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      save();
    });

    // Manejar teclas
    select.addEventListener("keydown", (e) => {
      e.stopPropagation();

      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });

    // Cancelar si se hace click fuera del elemento
    const handleClickOutside = (e) => {
      if (!cell.contains(e.target)) {
        cancel();
        document.removeEventListener("click", handleClickOutside);
      }
    };

    // Agregar el listener después de un pequeño delay para evitar que se active inmediatamente
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 100);
  }

  function getStatusDisplayName(statusName) {
    const statusMap = {
      generar_pedido: "Generar Pedido",
      stock_optimo: "Stock Óptimo",
      excedido: "Excedido",
      muy_excedido: "Muy Excedido",
    };
    return statusMap[statusName] || "Stock Óptimo";
  }

  function updatePagination(pagination) {
    const paginationDiv = elements.pagination;
    paginationDiv.innerHTML = "";

    if (pagination.pages <= 1) return;

    // Botón anterior
    const prevBtn = document.createElement("button");
    prevBtn.textContent = "‹ Anterior";
    prevBtn.disabled = pagination.page === 1;
    prevBtn.addEventListener("click", () =>
      loadControlItems(pagination.page - 1)
    );
    paginationDiv.appendChild(prevBtn);

    // Números de página
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.pages, pagination.page + 2);

    for (let i = startPage; i <= endPage; i++) {
      const pageBtn = document.createElement("button");
      pageBtn.textContent = i;
      pageBtn.className = i === pagination.page ? "current-page" : "";
      pageBtn.addEventListener("click", () => loadControlItems(i));
      paginationDiv.appendChild(pageBtn);
    }

    // Botón siguiente
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Siguiente ›";
    nextBtn.disabled = pagination.page === pagination.pages;
    nextBtn.addEventListener("click", () =>
      loadControlItems(pagination.page + 1)
    );
    paginationDiv.appendChild(nextBtn);
  }

  // ==================== EVENT LISTENERS ====================

  function setupEventListeners() {
    // Botones de control
    elements.createControlBtn.addEventListener("click", createControl);
    elements.saveControlBtn.addEventListener("click", saveControl);
    elements.completeControlBtn.addEventListener("click", completeControl);

    // Formulario de agregar producto
    elements.addProductForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const data = {
        product_id: document.getElementById("selectedProductId").value,
        category_id: document.getElementById("categorySelect").value,
        condition_id: document.getElementById("conditionSelect").value,
        product_status_id:
          document.getElementById("productStatusSelect").value || 1,
        stock_require: document.getElementById("stockRequire").value,
        stock_current: document.getElementById("stockCurrent").value,
        notes: document.getElementById("productNotes").value,
      };

      if (
        !data.product_id ||
        !data.category_id ||
        !data.condition_id ||
        !data.stock_require ||
        !data.stock_current
      ) {
        showMessage("Por favor completa todos los campos requeridos", "error");
        return;
      }

      // Y agregar esta validación específica para el producto:
      const productInput = document.getElementById("productInput");
      const selectedProductId = document.getElementById("selectedProductId");

      if (!selectedProductId.value) {
        showMessage(
          "Por favor selecciona un producto válido de la lista",
          "error"
        );
        productInput.focus();
        return;
      }

      addProduct(data);
    });

    // Filtros
    document
      .getElementById("categoryFilter")
      .addEventListener("change", handleFilterChange);
    document
      .getElementById("conditionFilter")
      .addEventListener("change", handleFilterChange);
    document
      .getElementById("productStatusFilter")
      .addEventListener("change", handleFilterChange);
    document
      .getElementById("stockStatusFilter")
      .addEventListener("change", handleFilterChange);

    // Búsqueda con debounce
    let searchTimeout;
    document.getElementById("searchFilter").addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentFilters.search = e.target.value;
        currentPage = 1;
        loadControlItems(1);
      }, 300);
    });

    // Limpiar todos los filtros
    document.getElementById("clearFilters").addEventListener("click", () => {
      document.getElementById("categoryFilter").value = "";
      document.getElementById("conditionFilter").value = "";
      document.getElementById("productStatusFilter").value = "";
      document.getElementById("stockStatusFilter").value = "";
      document.getElementById("searchFilter").value = "";
      currentFilters = {};
      currentPage = 1;
      loadControlItems(1);
    });
    /*
    // Navegación
    document.getElementById('backToControl').addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/control';
    });
    */
    // Agregar al final de setupEventListeners() en stock-frontend.js
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
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
          window.location.href = "/";
        }
      });
    }
  }

  // ==================== CORRECCIÓN EN handleFilterChange ====================
  function handleFilterChange(e) {
    const filterName = e.target.id.replace("Filter", "");
    const filterValue = e.target.value;

    // Mapeo correcto de nombres de filtro a parámetros de API
    const filterMapping = {
      category: "category_id",
      condition: "condition_id",
      productStatus: "product_status_id",
      stockStatus: "stock_status_id",
    };

    const apiParamName = filterMapping[filterName] || filterName;

    if (filterValue) {
      currentFilters[apiParamName] = filterValue;
    } else {
      delete currentFilters[apiParamName];
    }

    currentPage = 1;
    loadControlItems(1);
  }

  // ==================== AGREGAR FUNCIÓN PARA LIMPIAR FILTROS INDIVIDUALES ====================
  function clearFilter(filterName) {
    const filterMapping = {
      category: "category_id",
      condition: "condition_id",
      productStatus: "product_status_id",
      stockStatus: "stock_status_id",
    };

    const apiParamName = filterMapping[filterName] || filterName;
    delete currentFilters[apiParamName];

    // Resetear el valor del select en UI
    const filterElement = document.getElementById(`${filterName}Filter`);
    if (filterElement) {
      filterElement.value = "";
    }

    currentPage = 1;
    loadControlItems(1);
  }

  // ==================== FUNCIONES AUXILIARES ====================

  function showMessage(message, type) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;

    elements.messageContainer.innerHTML = "";
    elements.messageContainer.appendChild(messageDiv);

    setTimeout(() => {
      messageDiv.remove();
    }, 5000);
  }

  // Función global para selector de sucursal
  window.selectBranch = function (branchId) {
    window.location.href = `/stock.html?branch=${branchId}`;
  };

  // Función global para eliminar producto (llamada desde HTML)
  window.deleteProduct = deleteProduct;
  window.populateBranchesMenu = populateBranchesMenu;
  window.populateStockMenu = populateStockMenu;
  window.goToBranchSummary = goToBranchSummary;
  window.goToStock = goToStock;
});
