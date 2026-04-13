# Gotchas & Hard-Earned Lessons

This file records recurring bugs, tricky edge cases, and project-specific quirks.
Use it to prevent the AI (and yourself) from repeating past mistakes.

## Active Gotchas (check before implementing fixes)

| Date       | Issue                                       | Root Cause / Fix                                                                                                                                     | Tags                                         |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 2026-04-13 | Service worker "body is locked" error       | Must clone response before reusing body in addCacheTimestamp()                                                                                       | service-worker, response, caching            |
| 2026-04-13 | clearAppCacheManual is not defined error    | HTML onclick called undefined function - wrong function name in settings.html                                                                        | html, javascript, function-reference         |
| 2026-04-13 | getCachedMangaMetadata is not defined error | Missing import in offline.html - function exists but not imported from offline-manager.js                                                            | html, javascript, import-error               |
| 2026-04-13 | Reader.html not served offline              | Cache.match() didn't ignore query params - added { ignoreSearch: true } and offline-first logic                                                      | service-worker, cache, navigation            |
| 2026-04-13 | Version shows "GIT_COMMIT_HASH"             | Placeholder in version.json never replaced - created update-version.js script                                                                        | version, deployment, build-process           |
| 2026-04-13 | Update notification keeps reappearing       | localStorage not updated before reload - now set in applyUpdate() and always synced                                                                  | pwa, update, localStorage                    |
| 2026-04-13 | Atsumaru chapter preloading fails with 404  | Used wrong field name (atsumaruMangaId instead of mangaId) in offline-manager.js line 248                                                            | atsumaru, preloading, offline-manager        |
| 2026-04-13 | Continue reading implementation reverted    | Reverted to commit 300b2c8 - keep Atsumaru entries if no MangaDex match, restore navigation support, remove null filtering, add proxy logic for CORS | atsumaru, continue-reading, navigation, cors |
| 2026-04-13 | Atsumaru search API 400 error               | Netlify function expects parameter 'q' but client was sending 'query' - fixed parameter name in hybrid-api.js line 46                                | atsumaru, api, parameter-mismatch            |
