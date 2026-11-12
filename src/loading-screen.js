const MIN_TIME = 500; // minimum time the spinner shows (in milliseconds)
let started = false;

export function hideLoadingScreen() {
  if (started) return;
  started = true;

  const screen = document.getElementById('rally-loading-screen');
  if (!screen) return;

  const wait = Math.max(0, MIN_TIME - performance.now());

  setTimeout(() => {
    screen.classList.add('rally-fade-out');
    setTimeout(() => screen.remove(), 300);
  }, wait);
}