(function () {
  const STORAGE_KEY = "tiendaquesos_theme";

  function getPreferredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored === "dark" || stored === "light") {
      return stored;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  function getNextTheme(theme) {
    return theme === "dark" ? "light" : "dark";
  }

  function getButtonLabel(theme) {
    return theme === "dark" ? "☀️ Claro" : "🌙 Oscuro";
  }

  function createToggleButton(initialTheme) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.id = "themeToggle";
    button.setAttribute("aria-label", "Cambiar tema");
    button.textContent = getButtonLabel(initialTheme);

    button.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
      const nextTheme = getNextTheme(currentTheme);

      applyTheme(nextTheme);
      localStorage.setItem(STORAGE_KEY, nextTheme);
      button.textContent = getButtonLabel(nextTheme);
    });

    document.body.appendChild(button);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const currentTheme = getPreferredTheme();
    applyTheme(currentTheme);
    createToggleButton(currentTheme);
  });
})();
