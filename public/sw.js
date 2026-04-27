
// Service Worker optimizado para manejo de cache
const CACHE_NAME = 'prepaga-digital-v6';
const CACHE_VERSION = '6.0.0';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 horas

const urlsToCache = [
  '/manifest.json',
  '/offline.html',
];

// Instalación del Service Worker con limpieza automática
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Use addAll only for guaranteed-available resources
        return Promise.allSettled(
          urlsToCache.map(url => cache.add(url).catch(() => null))
        );
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// Activación con limpieza de cache obsoleto
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Limpiar caches obsoletos
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
            return Promise.resolve(false);
          })
        );
      }),
      // Tomar control inmediato de todas las páginas
      self.clients.claim()
    ])
  );
});

// Intercepción de peticiones con gestión inteligente de cache
self.addEventListener('fetch', (event) => {
  // Solo cachear peticiones GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Estrategia diferente para diferentes tipos de recursos
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response('Network error', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      )
    );
    return;
  }
  
  // Para archivos estáticos: Cache First
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?)$/)) {
    event.respondWith(cacheFirst(event.request));
  }
  // Para navegación HTML: Network First sin persistir app shell viejo
  else if (event.request.mode === 'navigate' || url.pathname.match(/^\/[^.]*$/)) {
    event.respondWith(networkFirstInternal(event.request, { cachePages: false }));
  }
  // Para API: Network Only
  else {
    event.respondWith(fetch(event.request));
  }
});

function canCacheResponse(request, response) {
  if (!response || response.status !== 200) return false;

  const contentType = response.headers.get('content-type') || '';
  const destination = request.destination;

  if (destination === 'script') return contentType.includes('javascript') || contentType.includes('ecmascript');
  if (destination === 'style') return contentType.includes('text/css');
  if (destination === 'image') return contentType.startsWith('image/');
  if (destination === 'font') return contentType.startsWith('font/') || contentType.includes('application/font');

  return true;
}

// Estrategia Cache First para archivos estáticos
async function cacheFirst(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Verificar si el cache no está expirado
      const cachedTime = cachedResponse.headers.get('sw-cache-time');
      if (cachedTime && (Date.now() - parseInt(cachedTime)) < CACHE_EXPIRY) {
        return cachedResponse;
      }
    }
    
    // Si no hay cache o está expirado, buscar en red
    const networkResponse = await fetch(request);
    
    if (canCacheResponse(request, networkResponse)) {
      const responseClone = networkResponse.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cache-time', Date.now().toString());
      const responseWithTime = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers,
      });

      await cache.put(request, responseWithTime);
      await cleanupCache(cache);
    }

    return networkResponse;
  } catch (error) {
    console.error('Error en cacheFirst:', error);
    const cache = await caches.open(CACHE_NAME);
    return cache.match(request) || new Response('Network error', { status: 500 });
  }
}

// Estrategia Network First para páginas
async function networkFirst(request) {
  return networkFirstInternal(request, { cachePages: true });
}

async function networkFirstInternal(request, options = { cachePages: true }) {
  try {
    const networkResponse = await fetch(request);
    
    if (options.cachePages && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
      await cleanupCache(cache);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Red no disponible, usando cache:', error);
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) return offlinePage;

    // Fallback garantizado: siempre devuelve un Response válido
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sin conexión</title></head><body><h1>Sin conexión</h1><p>No hay conexión disponible. Por favor recargue cuando tenga señal.</p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// Limpieza automática de cache
async function cleanupCache(cache) {
  try {
    if (!cache) return;

    const keys = await cache.keys();
    const now = Date.now();
    
    // Eliminar entradas expiradas
    const expiredKeys = [];
    
    for (const key of keys) {
      const response = await cache.match(key);
      if (!response || !response.headers) {
        expiredKeys.push(key);
        continue;
      }

      const cachedTime = response.headers.get('sw-cache-time');
      if (!cachedTime) {
        continue;
      }
      
      const parsedCachedTime = parseInt(cachedTime, 10);
      if (Number.isNaN(parsedCachedTime) || (now - parsedCachedTime) > CACHE_EXPIRY) {
        expiredKeys.push(key);
      }
    }
    
    // Eliminar entradas expiradas
    await Promise.all(expiredKeys.map(key => cache.delete(key)));
    
    // Si el cache sigue siendo muy grande, eliminar las entradas más antiguas
    const remainingKeys = await cache.keys();
    if (remainingKeys.length > 100) {
      const keysToDelete = remainingKeys.slice(0, remainingKeys.length - 100);
      await Promise.all(keysToDelete.map(key => cache.delete(key)));
    }
  } catch (error) {
    console.error('Error limpiando cache:', error);
  }
}

// Manejo de mensajes push optimizado
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || data.message,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      image: data.image,
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.id || '1',
        url: data.action_url
      },
      actions: data.action_url ? [
        {
          action: 'view',
          title: 'Ver',
          icon: '/icons/view-icon.png'
        },
        {
          action: 'close',
          title: 'Cerrar',
          icon: '/icons/close-icon.png'
        }
      ] : [],
      requireInteraction: data.type === 'signature_completed' || data.type === 'signature_pending',
      silent: false,
      tag: data.tag || 'default-notification'
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Manejo de clicks en notificaciones
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view' && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  } else if (event.action === 'close') {
    return;
  } else if (event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  } else {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Sincronización en segundo plano
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  } else if (event.tag === 'cache-cleanup') {
    event.waitUntil(performCacheCleanup());
  }
});

async function doBackgroundSync() {
  try {
    console.log('Sincronización en segundo plano ejecutada');
    
    const response = await fetch('/api/sync-offline-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        timestamp: Date.now()
      })
    });
    
    if (response.ok) {
      console.log('Datos sincronizados exitosamente');
    }
  } catch (error) {
    console.error('Error en sincronización:', error);
  }
}

async function performCacheCleanup() {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cleanupCache(cache);
    console.log('Limpieza programada de cache completada');
  } catch (error) {
    console.error('Error en limpieza programada:', error);
  }
}

// Limpieza automática cada 2 horas
setInterval(async () => {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cleanupCache(cache);
    
    // Limpiar notificaciones antiguas
    const notifications = await self.registration.getNotifications();
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    notifications.forEach(notification => {
      if (notification.data?.dateOfArrival < oneDayAgo) {
        notification.close();
      }
    });
  } catch (error) {
    console.error('Error en limpieza automática:', error);
  }
}, 2 * 60 * 60 * 1000); // 2 horas

// Manejo de mensajes
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
  
  if (event.data && event.data.type === 'FORCE_CACHE_CLEANUP') {
    performCacheCleanup();
  }
});
