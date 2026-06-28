import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

// A aplicação sempre inicia no tema claro; o usuário alterna manualmente na sessão.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, setTheme, toggle };
}
