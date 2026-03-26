const loginForm = document.getElementById("loginForm");
const statusEl = document.getElementById("status");

function setStatus(message) {
  statusEl.textContent = message;
}

async function login(event) {
  event.preventDefault();

  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    setStatus("Completa email y contraseña.");
    return;
  }

  try {
    setStatus("Validando usuario...");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo validar el usuario");
    }

    const user = data.user;

    TiendaAuth.setSession({
      id: user.id,
      nombre: user.nombre || user.email,
      email: user.email,
      rol: user.rol,
    });

    window.location.href = user.rol === "admin" ? "./panel-admin.html" : "./seller.html";
  } catch (error) {
    setStatus(error.message);
  }
}

loginForm.addEventListener("submit", login);
