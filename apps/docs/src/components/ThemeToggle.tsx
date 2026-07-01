import { createElement, useEffect, useState } from 'react';

// Thin default export so @astrojs/react's component probe (which calls the
// export directly, outside a render pass) never invokes hooks.
export default function ThemeToggle() {
  return createElement(ThemeToggleInner);
}

function ThemeToggleInner() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  useEffect(() => { setTheme((document.documentElement.dataset.theme as 'light' | 'dark') || 'dark'); }, []);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('wdk-theme', next);
    setTheme(next);
  };
  return <button type="button" aria-label="Toggle theme" className="wdk-theme-toggle" onClick={flip}>{theme === 'dark' ? '☀' : '☽'}</button>;
}
