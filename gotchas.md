# Gotchas & Hard-Earned Lessons

This file records recurring bugs, tricky edge cases, and project-specific quirks.
Use it to prevent the AI (and yourself) from repeating past mistakes.

## Active Gotchas (check before implementing fixes)

| Date       | Issue                                   | Root Cause / Fix                      | Tags         |
|------------|-----------------------------------------|---------------------------------------|--------------|
| 2026-04-13 | Service worker "body is locked" error   | Must clone response before reusing body in addCacheTimestamp() | service-worker, response, caching |
