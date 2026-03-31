const loginForm = document.getElementById("loginForm");
const statusEl = document.getElementById("status");

function setStatus(message) {
  statusEl.textContent = message;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
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
      telefono: normalizePhone(user.telefono || ""),
    });

   if (user.rol === "admin") {
  window.location.href = "./panel-admin.html";
} else if (user.rol === "seller") {
  window.location.href = "./seller.html";
} else {
  window.location.href = "./index.html"; // usuario común u otro rol
}
  } catch (error) {
    setStatus(error.message);
  }
}

loginForm.addEventListener("submit", login);
