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
      status.textContent = 'Registro exitoso. Redirigiendo...';
      setTimeout(() => {
        window.location.href = './login.html';
      }, 1500);
    } else {
      const data = await res.json();
      status.textContent = data.error || 'Error en el registro.';
    }
  } catch (err) {
    status.textContent = 'Error de red.';
  }
});
