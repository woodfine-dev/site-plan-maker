# Site Plan Maker

Draw 11×17 landscape site plan sheets over a live aerial or street map, fill in
the title block, and export the set to PDF.

- Search an address or `lat, lng`, then pan and zoom to frame the site.
- Tools: boundary (B), parcel (P), callout (L), text (T), polygon (O), erase (E), pan (V); ⌃Z undoes.
- Several sheets per plan, and several plans open at once as tabs.
- Imagery: Esri World Imagery, Carto, OpenStreetMap, OpenTopoMap, USGS and more.
- Data layers (**Data** tab):
  - **Toronto:** zoning, Official Plan policies, development applications, heritage, TRCA and more.
  - **Ontario-wide:** Oak Ridges Moraine, Niagara Escarpment Plan, provincial natural heritage system, wetlands, ANSIs, built-up area.
  - **Local:** the app works out which municipality and conservation authority the map is over and lists their open layers. Regulated areas cover TRCA, CVC, NPCA, LSRCA, NVCA, Conservation Halton and CLOCA. Parcels, zoning, OP, development applications and heritage come from Mississauga, Brampton, Oakville, Burlington, Milton, Hamilton, York Region, Newmarket, Durham, Oshawa, Whitby, Ajax, Clarington, Pickering, Niagara Falls, Barrie, Waterloo, Kitchener and Brantford, where each publishes them.
  - **Parcel pick** (P) works in Toronto and wherever the municipality publishes parcels.
  - Layers outside Toronto are listed in `public/sources.js`. **Open `/check.html`** on the live site to test every source from your browser; a source that fails shows a notice and the rest keep working.
- Title block with key plan, site area, notes, revisions, scale bar and a logo you can drop in.
- Export the whole set, or just the focused sheet, as an 11×17 PDF.

Everything you draw is saved in your browser (`localStorage`), per browser and per
device. There's no account or server-side storage, so use **File › Back up all plans**
now and then: it saves every open plan, logos included, to one `.json` file. **Import**
opens a plan or backup file in new tabs and never replaces what's open. If the browser's
storage fills up, a red banner says saving has stopped.

## Run locally

Needs Node 20 or later. The app itself has no dependencies; Playwright is only for the
browser tests.

```bash
npm start                              # http://localhost:8080  (set PORT to change it)
npm test                               # every asset the page loads is served; server path handling
npm install && npx playwright install chromium
npm run test:e2e                       # the app in Chromium, with map and data services faked
```

Any static file server pointed at `public/` works as well.

## Deploy on Render

`render.yaml` describes a Render **static site** that publishes `public/`, with no
build step. In the Render dashboard choose **New → Blueprint**, pick this
repository, and apply. Every push to `main` redeploys, and pull requests get
preview URLs.

## Layout

```
public/
  index.html        the app: markup, styles and its logic (the <script type="text/x-dc"> block)
  vendor/           libraries, vendored so the app has no CDN dependency at runtime
    dc-runtime.js     the template runtime the page is written for ({{ }}, <sc-for>, <sc-if>)
    react-*.js        React 18.3.1, which the runtime renders with
    leaflet-1.9.4.js  map
    turf.min.js       geometry: areas, lengths, offsets
    html2canvas, jspdf  PDF export
    image-slot.js     the title-block logo drop box (saves to localStorage, one logo per plan)
  fonts/            Archivo Narrow and IBM Plex Mono
  img/              Leaflet marker images
server.js           zero-dependency static server for local use
public/sources.js   data sources outside Toronto, and how they're found, queried and matched to a place
public/check.html   tests every source from the browser
tests/              server and asset tests (*.test.js), browser tests (*.e2e.js)
render.yaml         Render Blueprint
```

The app was exported from Claude Design as a single self-unpacking HTML file.
This repository is that file unpacked into ordinary files. The one change to
behaviour is that the logo box now saves to `localStorage`, since the Claude
Design host it used to save through isn't here.

## Network

The browser calls these services directly: map tiles (Esri ArcGIS Online,
Carto, OpenStreetMap, OpenTopoMap, CyclOSM, USGS), Nominatim for address
search, Overpass for roads and buildings, and City of Toronto and Ontario
(LIO) GIS services for the Toronto and Ontario layers. Follow each provider's
usage policy. Nominatim, for example, allows at most one request per second
and doesn't allow heavy use.
