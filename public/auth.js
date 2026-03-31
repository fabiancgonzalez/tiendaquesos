(function () {
  const SESSION_KEY = "tiendaquesos_session";

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (_error) {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function hasRequiredRole(session, role) {
    if (!role) {
      return true;
    }

    if (!session) {
      return false;
    }

    if (role === "seller") {
      return session.rol === "vendedor" || session.rol === "admin";
    }
    

    return session.rol === role;
  }

  function syncNavVisibility(session) {
    document.querySelectorAll("[data-require-session='true']").forEach((link) => {
      const requiredRole = link.dataset.requireRole;
      const canShow = Boolean(session) && hasRequiredRole(session, requiredRole);
      link.hidden = !canShow;
    });
  }

  async function refreshSession() {
    try {
      const response = await fetch("/api/auth/me");

      if (!response.ok) {
        clearSession();
        return null;
      }

      const data = await response.json();
      setSession(data.user || null);
      return data.user || null;
    } catch (_error) {
      clearSession();
      return null;
    }
  }

  function renderAuthBar(session) {
    const nav = document.querySelector(".nav");

    if (!nav) {
      return;
    }

    const current = nav.querySelector(".auth-inline");

    if (current) {
      current.remove();
    }

    const wrapper = document.createElement("div");
    wrapper.className = "auth-inline";

    if (session) {
      const user = document.createElement("span");
      user.className = "small";
      user.textContent = `${session.nombre} | ${session.rol}`;

      const logout = document.createElement("button");
      logout.type = "button";
      logout.className = "ghost";
      logout.textContent = "Salir";
      logout.addEventListener("click", async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch (_error) {
          // noop
        }

        // Limpiar carrito al cerrar sesión
        try {
          localStorage.removeItem("tiendaquesos_cart");
        } catch (_e) {}

        clearSession();
        window.location.href = "./login.html";
      });

      wrapper.appendChild(user);
      wrapper.appendChild(logout);
    } else {
      const loginLink = document.createElement("a");
      loginLink.href = "./login.html";
      loginLink.className = "ghost-link";
      loginLink.textContent = "Ingresar";
      wrapper.appendChild(loginLink);
    }

    nav.appendChild(wrapper);
  }

  async function protectPage() {
    const requiredRole = document.body.dataset.requireRole;
    const session = await refreshSession();

    syncNavVisibility(session);

    if (requiredRole && !hasRequiredRole(session, requiredRole)) {
      window.location.href = "./login.html";
      return;
    }

    renderAuthBar(session);
  }

  window.TiendaAuth = {
    getSession,
    refreshSession,
    setSession,
    clearSession,
    protectPage,
  };

  document.addEventListener("DOMContentLoaded", protectPage);
})();
