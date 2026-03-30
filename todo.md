# Sprint 3 TODO

## P0 — Combined Site Intelligence Panel
- [x] Create SiteIntelligencePanel.tsx with FloatingPanel wrapper + 3 tabs
- [x] Tab 1: Gantt Timeline (merge timeline milestones + phase energization dates)
- [x] Tab 2: Phase Details (expanded cards with parcel lists)
- [x] Tab 3: Parcels (filtered parcel table grouped by phase)
- [x] Wire into Dashboard.tsx, replace separate Timeline + PhaseDrilldown panels
- [x] Single "Site Intel" button replaces Timeline + Phases buttons in action bar
- [x] Multi-site comparison still works in Tab 1 when 2+ sites selected

## P0 — Gantt Chart Readability
- [x] Redesign: place milestones in their category swim lanes (not all on one axis)
- [x] Make chart width dynamic (scale with panel/container width on maximize)
- [x] Better label spacing / collision avoidance for milestone labels
- [x] Sticky category lane labels (freeze as locked left column on horizontal scroll)

## P0 — Kansas City Site Merge
- [x] Merge 3 KC entries into 2: Hunt Midwest (Phase 1, south) + Project Mica (Phase 2, north/AG Rose)
- [x] Update site definitions, labels, phase data
- [x] Test and verify

## P0 — Rainier 2 Jackson Site Merge
- [x] Merge 3 Rainier 2 entries into 2: Canton (north, entries 1+3) + Ridgeland (south, entry 2)
- [x] Keep owner distinctions as-is
- [x] Update useData.ts with merge logic

## P0 — South Bend IN AWS Merge
- [x] Merge 2 South Bend entries into 1
- [x] Update useData.ts with merge logic

## P0 — Lueders TX Site Merge
- [x] Merge 2 Lueders TX entries into 1
- [x] Update useData.ts with merge logic

## P0 — Port Washington WI Merge + Owner-Colored Compare Bars
- [x] Analyze PW site IDs and parcel owner data
- [x] Merge 2 PW entries into 1 in useData.ts
- [x] Add owner-colored segmented bars in Compare view
- [x] Test and verify

## P0 — Musk / Elon Parent Group
- [x] Create 'Musk / Elon' parent group for xAI + SpaceX + Austin EdgeConneX
- [x] Update companies.ts with new group definition
- [x] Test and verify

## Deferred — User Requests (Post-Sprint 3)
- [ ] Merge other duplicate sites (Rainier 2 Jackson, South Bend AWS, Lueders TX, Austin TX)

## P0 — Phase Polygon Map Overlays (Feature 1)
- [ ] Add `phasePolygons` and `highlightedPhase` props to ParcelMap
- [ ] Create a dedicated Leaflet pane for phase overlays (above parcels)
- [ ] Render phase polygon boundaries as colored semi-transparent fills when highlightedPhase is set
- [ ] When highlightedPhase matches a specific phase ID, show only that phase polygon
- [ ] Add a "Show All Phases" button to PhaseDetailsTab header
- [ ] When "Show All" is active, render all phase polygons for the site with distinct colors
- [ ] Phase polygon labels on the map (phase name inside polygon)

## P0 — Phase-Based Symbology Mode (Feature 2)
- [ ] Add "phase" to SymbologyMode union type in symbology.ts
- [ ] Add Phase option to SYMBOLOGY_OPTIONS array
- [ ] Create buildPhaseSymbology function that colors parcels by phase assignment
- [ ] Export PHASE_COLORS and getParcelPhase from useSpatialPhases for reuse
- [ ] Wire phase assignments into Dashboard.tsx → buildSymbology call
- [ ] Unassigned parcels show as gray in phase symbology mode
- [ ] Legend shows phase names with colors and parcel counts
