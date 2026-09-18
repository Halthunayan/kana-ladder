var CACHE = "kana-ladder-v45";
/* The voice files are large and never change in place, so they live in their
   own cache and survive every deploy. Wiping them with the shell would make a
   two line change cost a forty megabyte re-download. The name is bumped only
   when the whole library is re-rendered, as it was for the second voice: every
   sprite has a new name anyway, so keeping the old bucket would leave fifty
   four megabytes of audio on the phone that nothing will ever ask for again. */
var AUDIO_CACHE = "kana-audio-v2";
var SHELL = ["./","./index.html","./manifest.webmanifest",
  "./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png",
  "./icons/icon-maskable-512.png","./icons/favicon-32.png"];

// Cache each file on its own: addAll is atomic, so one failed icon would
// otherwise leave the app with no offline copy at all.
self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(SHELL.map(function(u){
      return c.add(u).catch(function(){ return null; });
    })).then(function(){ return c.match("./index.html"); });
  }).catch(function(){}));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.match("./index.html");
  }).then(function(hit){
    // only drop the previous cache once this one can actually serve the app
    if(!hit) return null;
    return caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return (k===CACHE || k===AUDIO_CACHE) ? null : caches.delete(k);
      }));
    });
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;
  var u = new URL(req.url);
  if(u.origin !== self.location.origin) return;
  /* The manifest is the one audio file that must be fresh: it maps each sprite
     to the content named file that currently holds it, and everything else is
     immutable only because its name changes when its contents do. Serving a
     stale manifest from cache pins the phone to the sprite files of whichever
     build it first saw, which is exactly what content naming exists to prevent.
     The app asks for it with cache: no-store, but that controls the HTTP cache
     and says nothing to a service worker, so the rule has to live here. */
  if(u.pathname.indexOf("/audio/") >= 0 && /manifest\.json$/.test(u.pathname)){
    e.respondWith(
      fetch(req).then(function(res){
        if(res && res.ok){
          var copy=res.clone();
          caches.open(AUDIO_CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
        }
        return res;
      }).catch(function(){
        return caches.open(AUDIO_CACHE).then(function(c){ return c.match(req); });
      })
    );
    return;
  }
  // immutable, and fetched by the app itself: serve from its own cache, never refresh
  if(u.pathname.indexOf("/audio/") >= 0){
    e.respondWith(caches.open(AUDIO_CACHE).then(function(c){
      return c.match(req).then(function(hit){
        if(hit) return hit;
        return fetch(req).then(function(res){
          if(res && res.ok) c.put(req, res.clone()).catch(function(){});
          return res;
        });
      });
    }).catch(function(){ return fetch(req); }));
    return;
  }
  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit) {
        // refresh in the background, serve the cached copy now
        fetch(req).then(function(res){
          if(res && res.ok) caches.open(CACHE).then(function(c){ c.put(req, res.clone()); });
        }).catch(function(){});
        return hit;
      }
      return fetch(req).then(function(res){
        if(res && res.ok) { var copy=res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); }
        return res;
      }).catch(function(){ return caches.match("./index.html"); });
    })
  );
});
