import './style.css';
import { App } from './App';

// Entry point. Wait for the DOM (and the global MediaPipe scripts) to be ready,
// then boot the mirror.
function boot(): void {
  const app = new App();
  void app.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
