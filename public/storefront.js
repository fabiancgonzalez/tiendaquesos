const productsGrid = document.getElementById("productsGrid");
const featuredStatus = document.getElementById("featuredStatus");
const cartItemsEl = document.getElementById("cartItems");
const cartStatusEl = document.getElementById("cartStatus");
const cartSummaryEl = document.getElementById("cartSummary");
const checkoutStatusEl = document.getElementById("checkoutStatus");
const checkoutForm = document.getElementById("checkoutForm");
const cartMenuBtn = document.getElementById("cartMenuBtn");
const cartMenuCount = document.getElementById("cartMenuCount");
const cartPanel = document.getElementById("cartPanel");
const closeCartBtn = document.getElementById("closeCartBtn");
const storefrontNav = document.querySelector(".storefront-nav");
const storefrontNavToggle = document.getElementById("storefrontNavToggle");
const storefrontNavLinks = document.getElementById("storefrontNavLinks");
const storefrontNavToggleIcon = document.getElementById("storefrontNavToggleIcon");
const storefrontNavToggleText = document.getElementById("storefrontNavToggleText");

const CART_KEY = "tiendaquesos_cart";
let productsCache = [];
let cart = readCart();

function setStatus(message) {
  if (featuredStatus) {
    featuredStatus.textContent = message;
  }
}

function setCartStatus(message) {
  if (cartStatusEl) {
    cartStatusEl.textContent = message;
  }
}

function setCheckoutStatus(message) {
  if (checkoutStatusEl) {
    checkoutStatusEl.textContent = message;
  }
}

function readCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch (_error) {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function openCartPanel() {
  cartPanel?.classList.remove("hidden");
}

function closeCartPanel() {
  cartPanel?.classList.add("hidden");
}

function setStorefrontMenuState(isOpen) {
  if (!storefrontNav || !storefrontNavToggle) {
    return;
  }

  storefrontNav.classList.toggle("menu-open", isOpen);
  storefrontNavToggle.setAttribute("aria-expanded", String(isOpen));
  storefrontNavToggle.setAttribute("aria-label", isOpen ? "Cerrar menu" : "Abrir menu");

  if (storefrontNavToggleIcon) {
    storefrontNavToggleIcon.textContent = isOpen ? "✕" : "☰";
  }

  if (storefrontNavToggleText) {
    storefrontNavToggleText.textContent = isOpen ? "Cerrar" : "Menu";
  }
}

function bindStorefrontMenu() {
  if (!storefrontNav || !storefrontNavToggle || !storefrontNavLinks) {
    return;
  }

  storefrontNavToggle.addEventListener("click", () => {
    const isOpen = storefrontNav.classList.contains("menu-open");
    setStorefrontMenuState(!isOpen);
  });

  storefrontNavLinks.addEventListener("click", (event) => {
    const target = event.target;

    if (target instanceof HTMLAnchorElement && window.innerWidth <= 900) {
      setStorefrontMenuState(false);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      setStorefrontMenuState(false);
    }
  });
}

function updateCartMenuCount() {
  if (!cartMenuCount) {
    return;
  }

  const totals = getCartTotals();
  cartMenuCount.textContent = String(totals.quantity || 0);
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function normalizeQuantity(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : 1;
}

function getProductById(productId) {
  return productsCache.find((product) => product.id === productId);
}

function addToCart(productId, quantity) {
  const product = getProductById(productId);

  if (!product) {
    return;
  }

  const stock = Number(product.stock_actual || 0);
  const requested = normalizeQuantity(quantity);
  const existing = cart.find((item) => item.id === productId);
  const nextQuantity = requested + Number(existing?.cantidad || 0);

  if (stock && nextQuantity > stock) {
    setCartStatus(`Stock insuficiente para ${product.nombre}. Disponible: ${stock}`);
    return;
  }

  if (existing) {
    existing.cantidad = nextQuantity;
  } else {
    cart.push({
      id: product.id,
      nombre: product.nombre,
      precio: Number(product.precio || 0),
      impuesto: Number(product.impuesto || 0),
      cantidad: requested,
      imagen: product.imagen || "",
    });
  }

  saveCart();
  renderCart();
  setCartStatus(`${product.nombre} agregado al carrito.`);
}

function updateCartQuantity(productId, quantity) {
  const product = getProductById(productId);
  const item = cart.find((entry) => entry.id === productId);

  if (!product || !item) {
    return;
  }

  const normalized = normalizeQuantity(quantity);
  const stock = Number(product.stock_actual || 0);

  if (stock && normalized > stock) {
    setCartStatus(`Stock insuficiente para ${product.nombre}. Disponible: ${stock}`);
    return;
  }

  item.cantidad = normalized;
  saveCart();
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter((item) => item.id !== productId);
  saveCart();
  renderCart();
}

function getCartTotals() {
  const quantity = cart.reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
  const amount = cart.reduce((sum, item) => sum + Number(item.cantidad || 0) * Number(item.precio || 0), 0);
  return {
    quantity: Number(quantity.toFixed(2)),
    amount: Number(amount.toFixed(2)),
  };
}

function renderCart() {
  if (!cartItemsEl || !cartSummaryEl) {
    return;
  }

  if (!cart.length) {
    cartItemsEl.innerHTML = '<p class="small">Tu carrito está vacío.</p>';
    cartSummaryEl.innerHTML = '<strong>0 items</strong> | Total: $0.00';
    setCheckoutStatus("");
    return;
  }

  cartItemsEl.innerHTML = cart
    .map((item) => {
      return `
        <div class="cart-item">
          <div>
            <strong>${item.nombre}</strong>
            <p class="small">$${formatMoney(item.precio)} por unidad</p>
          </div>
          <input class="cart-qty-input" type="number" min="0.1" step="0.1" value="${item.cantidad}" data-cart-qty="${item.id}" />
          <strong>$${formatMoney(Number(item.cantidad) * Number(item.precio))}</strong>
          <button type="button" class="danger" data-cart-remove="${item.id}">Quitar</button>
        </div>
      `;
    })
    .join("");

  const totals = getCartTotals();
  cartSummaryEl.innerHTML = `<strong>${totals.quantity} items</strong> | Total: $${formatMoney(totals.amount)}`;
  updateCartMenuCount();

  cartItemsEl.querySelectorAll("[data-cart-qty]").forEach((input) => {
    input.addEventListener("change", (event) => {
      updateCartQuantity(event.target.dataset.cartQty, event.target.value);
    });
  });

  cartItemsEl.querySelectorAll("[data-cart-remove]").forEach((button) => {
    button.addEventListener("click", () => removeFromCart(button.dataset.cartRemove));
  });
}

function openLink(url) {
  if (!url) {
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function triggerOrderNotifications(notification) {
  const whatsappBuyer = notification?.whatsapp?.buyer?.url;
  const whatsappAdmin = notification?.whatsapp?.admin?.url;
  const emailBuyer = notification?.email?.buyer;
  const emailAdmin = notification?.email?.admin;

  if (!notification?.whatsapp?.buyer?.sent && whatsappBuyer) {
    openLink(whatsappBuyer);
  }

  if (!notification?.whatsapp?.admin?.sent && whatsappAdmin) {
    openLink(whatsappAdmin);
  }

  const emailWasSent = Boolean(emailBuyer?.sent) && Boolean(emailAdmin?.sent);

  if (!emailWasSent) {
    openLink(emailBuyer?.mailto);
    openLink(emailAdmin?.mailto);
  }

  if (emailWasSent && notification?.whatsapp?.buyer?.sent && notification?.whatsapp?.admin?.sent) {
    setCheckoutStatus("Avisos enviados por WhatsApp y correo al comprador y administrador.");
  } else if (emailWasSent) {
    setCheckoutStatus("Correo enviado. WhatsApp se abrió en navegador si no estaba conectado whatsappweb.");
  } else if (notification?.email?.smtpConfigured) {
    setCheckoutStatus("Correo parcial enviado. Revisa destinatarios o configuración SMTP.");
  } else {
    setCheckoutStatus("SMTP no configurado: se abrieron borradores de correo para enviar manualmente.");
  }
}


function getProductImage(product) {
  // Mapea nombre o tipo de producto a imagen local
  const name = String(product.nombre || "").toLowerCase();
  const type = String(product.tipo_queso || "").toLowerCase();
  if (name.includes("crema")) return "./img/crema_santa_teresa.png";
  if (name.includes("cremoso")) return "./img/cremoso_santa_teresa.jpg";
  if (name.includes("holanda")) return "./img/holanda_santa_teresa.jpg";
  if (name.includes("mozza")) return "./img/mozzarella_santa_teresa.jpg";
  if (name.includes("provoletta")) return "./img/provoletta_santa_teresa.jpg";
  if (name.includes("ricota")) return "./img/ricota_santa_teresa.jpg";
  if (name.includes("sardo")) return "./img/sardo_santa_teresa.jpg";
  if (name.includes("tybo")) return "./img/tybo_santa_teresa.jpg";
  if (type.includes("crema")) return "./img/crema_santa_teresa.png";
  if (type.includes("cremoso")) return "./img/cremoso_santa_teresa.jpg";
  if (type.includes("holanda")) return "./img/holanda_santa_teresa.jpg";
  if (type.includes("mozza")) return "./img/mozzarella_santa_teresa.jpg";
  if (type.includes("provoletta")) return "./img/provoletta_santa_teresa.jpg";
  if (type.includes("ricota")) return "./img/ricota_santa_teresa.jpg";
  if (type.includes("sardo")) return "./img/sardo_santa_teresa.jpg";
  if (type.includes("tybo")) return "./img/tybo_santa_teresa.jpg";
  return product.imagen || "https://placehold.co/600x400/0f172a/e5e7eb?text=Queso";
}

function renderProducts(products) {
  if (!productsGrid) {
    return;
  }

  if (!products.length) {
    productsGrid.innerHTML = '<p class="small">No hay productos publicados.</p>';
    return;
  }

  productsGrid.innerHTML = products
    .map((product) => {
      const image = getProductImage(product);
      const stock = Number(product.stock_actual || 0);
      return `
        <article class="product-card">
          <img class="product-card-image" src="${image}" alt="${product.nombre || "Producto"}" />
          <div class="product-card-body">
            <div class="row" style="justify-content: space-between; align-items: flex-start;">
              <div>
                <h3>${product.nombre || "Producto"}</h3>
                <p class="small">${product.tipo_queso || "Queso artesanal"}</p>
              </div>
              <span class="badge">Stock: ${product.stock_actual ?? "-"}</span>
            </div>
            <p class="price-tag">$${formatMoney(product.precio)}</p>
            <p class="small">Unidad: ${product.unidad || "kg"}</p>
            <div class="product-actions">
              <input class="qty-input" type="number" min="0.1" step="0.1" value="1" data-qty-input="${product.id}" ${stock <= 0 ? "disabled" : ""} />
              <button type="button" data-add-to-cart="${product.id}" ${stock <= 0 ? "disabled" : ""}>Agregar</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  productsGrid.querySelectorAll("[data-add-to-cart]").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.dataset.addToCart;
      const quantityInput = productsGrid.querySelector(`[data-qty-input="${productId}"]`);
      addToCart(productId, quantityInput?.value || 1);
    });
  });
}

async function loadProducts() {
  try {
    setStatus("Cargando productos...");
    const response = await fetch("/api/store/products");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar productos");
    }

    productsCache = data.items || [];
    renderProducts(productsCache);
    renderCart();
    setStatus(`Productos disponibles: ${productsCache.length}`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function submitOrder(event) {
  event.preventDefault();

  // Verificar sesión de usuario antes de continuar
  let session = null;
  try {
    session = JSON.parse(localStorage.getItem("tiendaquesos_session") || "null");
  } catch (_e) {
    session = null;
  }
  if (!session) {
    // Guardar intento de checkout para volver después del login
    localStorage.setItem("tiendaquesos_checkout_redirect", "1");
    window.location.href = "./login.html";
    return;
  }

  if (!cart.length) {
    setCartStatus("Agrega productos antes de enviar el pedido.");
    return;
  }

  const formData = new FormData(checkoutForm);
  // Hacer copia del carrito antes de vaciarlo
  const cartCopy = Array.isArray(cart) ? cart.map(item => ({ ...item })) : [];
  // Construir datos de cliente y vendedor correctamente
  // Construir el objeto cliente exactamente con los campos del formulario
  const cliente = {
    nombre: session?.nombre || session?.user?.nombre || String(formData.get("nombre") || "").trim(),
    email: session?.email || session?.user?.email || String(formData.get("email") || "").trim(),
    telefono: session?.telefono || session?.user?.telefono || String(formData.get("telefono") || "").trim(),
    direccion: String(formData.get("direccion") || "").trim(),
    observaciones: String(formData.get("observaciones") || "").trim(),
    vendedor: String(formData.get("vendedor") || "").trim() || (session?.rol === "seller" || session?.rol === "admin" ? (session?.nombre || session?.user?.nombre || session?.email || session?.user?.email) : (session?.email || session?.user?.email || "tiendaweb")),
  };
  const payload = {
    cliente,
    vendedor: cliente.vendedor, // redundante para asegurar que llegue
    forma_de_pago: String(formData.get("forma_de_pago") || "Pendiente"),
    items: cartCopy,
  };

  try {
    setCartStatus("Enviando pedido...");
    setCheckoutStatus("Procesando notificaciones...");
    const response = await fetch("/api/store/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo enviar el pedido");
    }

    // Vaciar carrito solo después de que el pedido fue enviado correctamente
    cart = [];
    saveCart();
    try { localStorage.removeItem("tiendaquesos_cart"); } catch (_e) {}
    renderCart();
    checkoutForm.reset();
    closeCartPanel();
    setCartStatus(`Pedido generado: ${data.order.id}`);
    triggerOrderNotifications(data.notification || {});
    await loadProducts();
    // Redirigir al index después de confirmar
    setTimeout(() => {
      window.location.href = "./index.html";
    }, 1200);
  } catch (error) {
    setCartStatus(error.message || "Error al enviar el pedido");
  }
}

// Si el usuario viene de login y quería hacer checkout, volver a abrir el carrito
if (localStorage.getItem("tiendaquesos_checkout_redirect")) {
  openCartPanel();
  localStorage.removeItem("tiendaquesos_checkout_redirect");
}
cartMenuBtn?.addEventListener("click", () => {
  const isHidden = cartPanel?.classList.contains("hidden");
  if (isHidden) {
    openCartPanel();
  } else {
    closeCartPanel();
  }
});
closeCartBtn?.addEventListener("click", closeCartPanel);
if (checkoutForm) {
  checkoutForm.addEventListener("submit", submitOrder);
}

// Cargar productos al iniciar la página
document.addEventListener("DOMContentLoaded", () => {
  loadProducts();
});
