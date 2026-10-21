# In a hurry: exploration version

## Implemented
- The 15 facilities nearest the spawn point (by geographic distance) from the existing restroom snapshot; no shortlist or persistent results panel. Generic WC markers reveal only a real walking duration and a Walk here button before arrival.
- Every trip starts from the character's latest route endpoint. Walking follows cumulative distance along the returned pedestrian geometry.
- Arrival reveals the source name and attributes. Unsuitable visits keep the character there and allow another attempt. Success offers the next character; seven characters rotate without repeating until the cycle finishes.
- A home scene includes a clock, time-dependent lighting, a drinking glass animation, and a door exit. Keyboard buttons, generic keyboard-focusable markers, responsive overlays, and reduced-motion transitions are implemented.

## Time model
`CONFIG.minutes` in game.js defaults to 60; set it to 30 for shorter rounds. Onboarding copy uses this setting. Search advances one simulated minute per three real seconds. Walking advances by the provider's duration, animated in 1.8-8 seconds. Reduced motion skips animation but charges the same travel time. Network loading and explicit pauses consume no simulated time; hiding the tab automatically pauses. Untimed mode preserves the scenario clock without a deadline.

Opening hours are checked at arrival, not departure. The scenario starts on a Tuesday and supports day rollover. Only year-round, parsed or parsed-with-assumption schedules without review flags confirm opening; other schedules remain uncertain. Missing data cannot establish suitability. Fully accessible status and a changing station are checked only when required by the character. These rules do not infer safety, cleanliness, or real-time access.

## Verification
Run `node game.test.cjs`. Tests use route fixtures and verify 15 markers and the drink-to-leave transition, hidden details, explicit walk confirmation, network/pause timing, route-time charging, repeat attempts, subsequent route origins, successful progression, deadlines, untimed play, schedule boundaries, character rotation, and land-polygon sampling.

The automated browser tool was unavailable during this revision, so mobile appearance, keyboard interaction in Leaflet, and live service behavior still require a browser smoke test. Serve the folder with `python -m http.server 8000`, then open game.html. No API credentials are required; internet access is needed for maps, libraries, fonts, and routes.

## Reflection
The game now makes players explore and discover whether a nearby facility meets their needs, rather than presenting the answer in advance. Failed visits become part of the journey. The accelerated clock keeps trips short while retaining the cost of walking.

Remaining limitations include uncertain source schedules, routes not verified for accessibility, network outages, and random starts that may be far from usable facilities. Next improvements are visual playtesting on phones and with keyboard users, clearer tuning of round difficulty, and a supported production routing service if traffic grows. The bathroom finder and data-exploration pages remain separate and unchanged by this revision.

The opening map bounds now include the spawn and all 15 selected facilities, with space for the clock and controls. This avoids an empty-looking map when a random spawn is far from facilities.

Seasonal-extension schedules use their documented base intervals for arrivals within those hours, provided the facility is year-round and has no review flag. Outside those intervals, unspecified extensions remain uncertain. No extension hours are invented.
