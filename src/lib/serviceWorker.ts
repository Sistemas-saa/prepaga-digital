let listenersInstalled = false;
let refreshQueued = false;
let periodicUpdateHandle: number | null = null;
let versionCheckHandle: number | null = null;

const SW_UPDATE_INTERVAL_MS = 15 * 60 * 1000;
const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min
let currentBuildVersion: string | null = null;

async function checkBuildVersion() {
  try {
    const res = await fetch(`/build-version.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = await res.json();
    const remoteVersion: string = data.version;
    if (!currentBuildVersion) {
      currentBuildVersion = remoteVersion;
      return;
    }
    if (remoteVersion !== currentBuildVersion && !refreshQueued) {
      refreshQueued = true;
      console.info('[SW] Nueva versión detectada, recargando...');
      window.location.reload();
    }
  } catch {
    // Sin conexión — ignorar
  }
}

const requestPeriodicUpdate = (registration: ServiceWorkerRegistration) => {
  registration.update().catch(() => null);
};

const installListeners = () => {
  if (listenersInstalled || typeof window === 'undefined') return;

  listenersInstalled = true;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshQueued) return;
    refreshQueued = true;
    window.location.reload();
  });
};

const activateWaitingWorker = (registration: ServiceWorkerRegistration) => {
  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
};

const installRegistrationHandlers = (registration: ServiceWorkerRegistration) => {
  installListeners();

  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;
    if (!installingWorker) return;

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        activateWaitingWorker(registration);
      }
    });
  });

  activateWaitingWorker(registration);
  requestPeriodicUpdate(registration);

  if (periodicUpdateHandle === null && typeof window !== 'undefined') {
    periodicUpdateHandle = window.setInterval(() => {
      requestPeriodicUpdate(registration);
    }, SW_UPDATE_INTERVAL_MS);
  }

  // Verificación periódica de nueva versión de build
  if (versionCheckHandle === null && typeof window !== 'undefined') {
    checkBuildVersion();
    versionCheckHandle = window.setInterval(checkBuildVersion, VERSION_CHECK_INTERVAL_MS);
  }
};

export const registerAppServiceWorker = async () => {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) {
    return null;
  }

  const registration = await navigator.serviceWorker.register('/sw.js', {
    updateViaCache: 'none',
  });

  installRegistrationHandlers(registration);

  return registration;
};

export const refreshAppServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return null;

  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length === 0) {
    return registerAppServiceWorker();
  }

  await Promise.all(
    registrations.map((registration) => registration.update().catch(() => null))
  );

  registrations.forEach(installRegistrationHandlers);

  return registrations[0] || null;
};
