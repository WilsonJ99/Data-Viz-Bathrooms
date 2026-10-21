# NYC Public Restrooms — D3 Midterm Prototype

This folder contains a working four-frame interactive prototype built from the cleaned NYC Public Restrooms dashboard export.

## Open it

The easiest option:

1. Make sure you have an internet connection.
2. Double-click `index.html`.
3. The prototype loads D3.js and Leaflet from public CDNs and OpenStreetMap map tiles.

For a classroom/demo setup, a local server is more reliable:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## What each frame does

1. **Overview**
   - Shows all 973 facilities listed as operational.
   - Uses schedule parsing quality to distinguish interpretable, conditional, and unresolved hours.
   - Includes search and clickable facility details.

2. **Day + time**
   - Lets the user select weekday and time.
   - D3 recomputes `listed open`, `listed closed`, `conditional`, and `hours unknown`.
   - Users can hide/show status categories.

3. **Accessibility**
   - Filters by source-listed accessibility category.
   - Filters changing-station information and facility type.
   - Keeps selected day/time status visible on the map.

4. **Uncertainty**
   - Shows a stacked availability summary for the selected day/time.
   - Compares the same selected time across all seven days.
   - Can summarize all facilities, source-listed accessible facilities, or facilities with a changing station.

## Important interpretation rule

For a `conditional` schedule that includes an explicit base interval, the prototype treats the facility as **listed open inside that explicit interval**. Outside the interval, it remains **conditional**.

Example:

`8am–4pm, Open later seasonally`

- 2 PM → listed open, with a visual qualification marker
- 6 PM → conditional, because the source does not specify the seasonal extension

This does **not** invent extension hours.

## Availability rule

```text
open_minute <= selected_minute < close_minute
```

The visualization represents a **typical listed week**, not verified real-time availability.

## Files

- `index.html` — interface structure
- `styles.css` — visual design
- `app.js` — D3 interaction, filtering, mapping layer, and charts
- `data.js` — cleaned data embedded for direct browser opening
- `public_restrooms_dashboard.json` — original cleaned dashboard JSON used to make `data.js`

## Technical note

Leaflet is used only for the geographic basemap and pan/zoom mechanics. The restroom markers, filtering logic, data joins, status calculations, counts, and summary chart are handled with D3.js.

Source dataset:
NYC Open Data — Public Restrooms  
https://data.cityofnewyork.us/City-Government/Public-Restrooms/i7jb-7jku

Cleaned dataset processing date: 2026-10-07

## Location-first experience (October 14, 2026)

`index.html` is now the visitor entrance; `explore.html` preserves the original four D3 views. The title remains NYC Public Restrooms.

- Start from the NYC map, share location explicitly, submit an address/neighborhood/ZIP, or explore the Washington Square Park example.
- Fly to up to four nearest mapped facilities. Cards and numbered markers share selection.
- Read raw listed hours, source accessibility, changing-station information, and notes. Open walking directions externally.
- Search from the map center deliberately; collapse the results sheet on mobile.
- About explains provenance, uncertainty, distance estimates, and privacy.

### Estimates and external services

No routing service is configured. Results rank by geodesic straight-line distance using Leaflet; approximate minutes equal ceil(meters / 80), minimum 1, assuming 4.8 km/h. The interface explicitly states that barriers and entrances can lengthen walks. These are not route ETAs. No route geometry or current-open claim is fabricated.

Explicit searches use the public Photon demo endpoint (https://github.com/komoot/photon). It requires no key, has no availability guarantee, and is intended for reasonable request volumes. A public-scale release should provision a geocoder with suitable capacity. Suggestions appear above the location field after a 450 ms pause with at least 3 characters. Superseded requests are canceled, results are cached in memory, and keyboard arrows/Enter/Escape support selection and dismissal. Searches have timeout and failure feedback. Map tiles use OpenStreetMap. Precise browser location stays in memory; clicking external directions sends the starting point and destination to Google Maps. Google Fonts, D3, and Leaflet are external dependencies. HTTPS (or localhost) is needed for browser geolocation.

### GitHub Pages deployment

No repository or publishing account is configured in this workspace. To publish:

1. Copy the contents of this prototype directory to a GitHub repository's root (include data.js, journey.js, journey.css, explore.html, app.js, and styles.css).
2. In repository Settings → Pages, deploy the main branch root directory.
3. Use the resulting HTTPS URL. No build step, private key, or server-side code is required.
4. Verify search/geolocation and external map resources on the deployed domain before submitting the public link.

The original cleaning package remains in the adjacent NYC_Public_Restrooms_Cleaning_Package directory; include it in a public source repository when sharing reproducibility evidence.

## Verification

Verified in the desktop browser: example entry, four nearest results, card selection, numbered-marker selection, map-center search, directions URL generation, and About dismissal. Verified responsive layout and expand/collapse at 390 × 844. JavaScript syntax check passed. External Photon search initially timed out and showed recovery feedback. After allowing a 20-second response window, live Williamsburg search, result choice, and neighborhood zoom passed. Device permission outcomes still require testing on the deployed site. Reduced motion is implemented via the system media query but was not emulated in this browser test.



## On-map walking directions

Selecting a card or numbered marker requests a pedestrian route from FOSSGIS's OSRM `routed-foot` service. The `driving` URL token is the OSRM API token; the separate routed-foot backend determines the walking profile. The blue GeoJSON line follows the returned street/path network; the selected card and route panel show the returned route distance and estimated duration. Expand step-by-step directions for maneuvers. The candidate list remains ranked by straight-line proximity; unselected cards retain explicitly labeled rough estimates.

Requests are limited to one per 1.1 seconds per page, cached in memory, canceled on selection/origin changes, and guarded against stale responses. Failed/no-route/timeout responses leave no invented route; Google Maps remains a fallback. Snapping is limited to 100 m at each endpoint. Route ends may differ from actual entrances; routes are not verified wheelchair-accessible. Starting/destination coordinates are sent to the routing provider, whose service logs requests. No keys are needed for this small prototype; production traffic needs a provisioned service. Provider policy: https://routing.openstreetmap.de/about.html . This supersedes the earlier no-routing implementation notes.

## Route selection update

The external Google Maps action has been replaced with **Choose this route**, which focuses the selected walking route within this map and collapses the mobile results sheet. Routing links and route caveats were removed from the results panel. Current service integration details and limitations are recorded in [TOOLS_AND_SERVICES.md](TOOLS_AND_SERVICES.md). This supersedes earlier Google Maps fallback notes.

## Bathroom Dash game

Open `game.html`, or use **Play game** beside Explore the data. The game is separate from the real-world finder.

- Seven fictional characters rotate in shuffled order, without repeats until all seven have appeared.
- At home, drink water, then leave. The game never requests the player's physical location.
- Random starting coordinates are generated near source records with explicit, unqualified Tuesday hours. The candidate set includes that anchor and three nearby records; it is not advertised as the four globally nearest usable bathrooms.
- Four real pedestrian routes are prepared before starting the timer. The round requires a confirmed suitable option at simulated arrival time, with at most a 30-minute budget. Missing/conditional/assumed hours are not treated as confirmed open.
- The walking budget is three minutes above the shortest suitable offered route, with a five-minute minimum. Decision time is 60 seconds; pause and untimed Relaxed mode are available. Leaving the browser tab automatically pauses the decision countdown.
- Choose Walk here to animate the character over the returned geometry in five seconds. Reduced-motion mode skips travel animation. The clock measures decision time; simulated arrival adds route minutes to the scenario time, independently of real decision seconds.
- Success checks listed hours at arrival, required full accessibility/changing-station attributes, and walking budget. A slower valid choice still succeeds; the shortest suitable choice gets Best fit. The result explains the best offered option and any unmet requirements. No medical or real-time availability claims are made.
- If routing cannot prepare a complete viable round after three attempts, the game offers a retry without charging decision time. No invented paths or ETAs are substituted.

Validation: `node game.test.cjs` checks seven-character rotation, viable pools for all seven characters, uncertain hours, onboarding, route preparation, countdown/pause, success, timeout, relaxed mode, incompatible choices, and network recovery using fixture routes. JavaScript syntax checks pass. Live browser/visual QA was unavailable during implementation because no browser was connected; real endpoint behavior and responsive layout still need in-browser verification.


## Current exploration game
The game has been updated from the earlier four-option design. See [GAMEPLAY.md](GAMEPLAY.md) for the current map-only discovery flow, 60-minute simulated clock, configuration, and verification.
