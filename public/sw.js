// Kill switch — этот SW удаляет все старые кеши и сам себя
// Когда у пользователя на устройстве установится этот SW (после первого открытия после деплоя),
// он сотрёт все кеши предыдущего SW и отпишется. После этого кеш больше не мешает обновлениям.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll();
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
