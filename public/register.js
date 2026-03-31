document.getElementById('registerForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const nombre = document.getElementById('nombre').value.trim();
  const email = document.getElementById('email').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const password = document.getElementById('password').value;
  const status = document.getElementById('status');
  status.textContent = '';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, telefono, password })
    });
    if (res.ok) {
      // Login automático tras registro
      try {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (loginRes.ok) {
          const loginData = await loginRes.json();
          if (window.TiendaAuth && loginData.user) {
            window.TiendaAuth.setSession({
              id: loginData.user.id,
              nombre: loginData.user.nombre || loginData.user.email,
              email: loginData.user.email,
              rol: loginData.user.rol,
            });
          }
        }
      } catch (_e) {}
      status.textContent = 'Registro exitoso. Redirigiendo...';
      setTimeout(() => {
        window.location.href = './index.html';
      }, 1500);
    } else {
      const data = await res.json();
      status.textContent = data.error || 'Error en el registro.';
    }
  } catch (err) {
    status.textContent = 'Error de red.';
  }
});
