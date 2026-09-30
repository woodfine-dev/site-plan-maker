// Open GIS data outside the City of Toronto: Ontario-wide layers, conservation authority
// regulated areas and municipal layers across the GTA and Greater Golden Horseshoe.
//
// None of these was checked from a browser when it was added: open /check.html to see
// which ones load. A source that fails simply shows as unavailable in the app.
//
// A source is found one of these ways:
//   url     an ArcGIS layer (…/MapServer/3) or a service (…/FeatureServer); for a service,
//           `match` picks the layer by name, else the first layer
//   item    an ArcGIS Online item id: a feature/map service (then `layer` or `match`), or a
//           web map (then `match` picks the operational layer by title)
//   search  an exact ArcGIS Online title, accepted only when `token` appears in the item's
//           owner, URL, title or description (a guard against other cities' look-alikes)
//
// `area` says where a layer applies: { prov: true }, { upper: 'york' }, { muni: 'oakville' }
// or { ca: 'credit valley' }. Tokens are matched against the Ontario municipal and
// conservation authority boundaries at the map centre (see locate()).
(function () {
  const LIO = 'https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/services/LIO_OPEN_DATA/';
  const OGL_ON = 'Contains information licensed under the Open Government Licence – Ontario.';

  // shared looks per kind of layer
  const look = {
    zoning: { color: '#7c3aed', style: { color: '#7c3aed', weight: 1.2, dashArray: '2 3', fillColor: '#7c3aed', fillOpacity: 0.05 } },
    op: { color: '#0d5c2e', style: { color: '#0d5c2e', weight: 1.4, fillColor: '#0d5c2e', fillOpacity: 0.08 } },
    parcels: { color: '#5c5a56', style: { color: '#5c5a56', weight: 0.8, fillOpacity: 0 } },
    devapps: { color: '#b8860b', style: { color: '#b8860b', weight: 1.5, fillColor: '#b8860b', fillOpacity: 0.12 } },
    heritage: { color: '#8b4513', style: { color: '#8b4513', weight: 1.4, fillColor: '#8b4513', fillOpacity: 0.12 } },
    reg: { color: '#0e7490', style: { color: '#0e7490', weight: 1.5, dashArray: '5 4', fillColor: '#0e7490', fillOpacity: 0.07 } },
    mtsa: { color: '#c2410c', style: { color: '#c2410c', weight: 1.8, dashArray: '8 4', fillOpacity: 0 } },
    row: { color: '#475569', style: { color: '#475569', weight: 2.2 } },
    sitePlan: { color: '#9a3412', style: { color: '#9a3412', weight: 1.2, dashArray: '3 3', fillOpacity: 0 } },
  };
  const S = (k, label, area, find, kind, extra) => Object.assign({ k, label, area, kind, cap: 300, minZoom: 13 }, look[kind] || {}, find, extra || {});
  const ogl = (who) => 'Contains information licensed under the Open Government Licence – ' + who + '.';

  const sources = [
    // ---- Stage 1: Ontario-wide (LIO) ----
    S('pvOrm', 'Oak Ridges Moraine designations', { prov: true }, { url: LIO + 'LIO_Open06/MapServer/28' }, 'op',
      { color: '#65a30d', style: { color: '#65a30d', weight: 1.4, fillColor: '#65a30d', fillOpacity: 0.08 }, minZoom: 11, credit: OGL_ON }),
    S('pvNep', 'Niagara Escarpment Plan designations', { prov: true }, { url: LIO + 'LIO_Open06/MapServer/26' }, 'op',
      { color: '#a16207', style: { color: '#a16207', weight: 1.4, fillColor: '#a16207', fillOpacity: 0.08 }, minZoom: 11, credit: OGL_ON }),
    S('pvNhs', 'Provincial natural heritage system', { prov: true }, { url: LIO + 'LIO_Open06/MapServer/22' }, 'op',
      { color: '#15803d', style: { color: '#15803d', weight: 1.2, dashArray: '4 3', fillColor: '#15803d', fillOpacity: 0.06 }, minZoom: 11, credit: OGL_ON }),
    S('pvWetland', 'Wetlands (incl. provincially significant)', { prov: true }, { url: LIO + 'LIO_Open01/MapServer/15' }, 'op',
      { color: '#0369a1', style: { color: '#0369a1', weight: 1.2, fillColor: '#0369a1', fillOpacity: 0.12 }, labelFields: ['WETLAND_TYPE', 'EVALUATION_STATUS', 'WETLAND_NAME'], credit: OGL_ON }),
    S('pvAnsi', 'Areas of natural & scientific interest', { prov: true }, { url: LIO + 'LIO_Open05/MapServer/3' }, 'op',
      { color: '#4d7c0f', style: { color: '#4d7c0f', weight: 1.2, dashArray: '2 2', fillColor: '#4d7c0f', fillOpacity: 0.06 }, credit: OGL_ON }),
    S('pvBuilt', 'Built-up area', { prov: true }, { url: LIO + 'LIO_Open01/MapServer/35' }, 'op',
      { color: '#6b7280', style: { color: '#6b7280', weight: 1, fillColor: '#6b7280', fillOpacity: 0.06 }, minZoom: 11, credit: OGL_ON }),

    // ---- Stage 2: conservation authority regulated areas ----
    S('caTrca', 'TRCA regulated area', { ca: 'toronto and region' },
      { url: 'https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/arcgis/rest/services/TRCA_Regulation_Limit2/FeatureServer/0' }, 'reg', { credit: 'Regulation limit © Toronto and Region Conservation Authority.' }),
    S('caCvc', 'Credit Valley regulated area', { ca: 'credit valley' },
      { url: 'https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/arcgis/rest/services/Generic_Regulations_Limit_2025/FeatureServer/0' }, 'reg', { credit: 'Regulation limit © Credit Valley Conservation.' }),
    S('caNpca', 'Niagara Peninsula regulated area', { ca: 'niagara' },
      { url: 'https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/arcgis/rest/services/NPCA_APPROXIMATE_REGULATION_LANDS/FeatureServer/0' }, 'reg', { credit: 'Approximate regulated lands © Niagara Peninsula Conservation Authority.' }),
    S('caLsrca', 'Lake Simcoe regulated area', { ca: 'lake simcoe' },
      { url: 'https://maps.simcoe.ca/arcgis/rest/services/Regulated_Areas_and_Watercourses/MapServer', match: /lsrca|lake simcoe/i }, 'reg', { credit: 'Regulated area: Lake Simcoe Region Conservation Authority, via County of Simcoe.' }),
    S('caNvca', 'Nottawasaga regulated area', { ca: 'nottawasaga' },
      { url: 'https://maps.simcoe.ca/arcgis/rest/services/Regulated_Areas_and_Watercourses/MapServer', match: /nvca|nottawasaga/i }, 'reg', { credit: 'Regulated area: Nottawasaga Valley Conservation Authority, via County of Simcoe.' }),
    S('caHalton', 'Conservation Halton regulated area', { ca: 'halton' },
      { search: 'Approximate Regulation Limit', token: 'halton' }, 'reg', { credit: 'Regulation limit © Conservation Halton.' }),
    S('caCloca', 'CLOCA regulated area', { ca: 'central lake ontario' },
      { search: 'CLOCA Regulated Areas', token: 'cloca' }, 'reg', { credit: 'Regulated areas © Central Lake Ontario Conservation Authority.' }),

    // ---- Stage 3: municipal ----
    // Peel
    S('miParcels', 'Parcels', { muni: 'mississauga' }, { item: 'df04a22833c9403fbb9f323de84956be' }, 'parcels', { minZoom: 16, parcels: true, credit: 'Data © City of Mississauga.' }),
    S('miOp', 'Official Plan land use', { muni: 'mississauga' }, { item: 'af2caaeb20a542fd871a5abcdf1834cb' }, 'op', { credit: 'Data © City of Mississauga.' }),
    S('miZoning', 'Zoning', { muni: 'mississauga' }, { search: 'Zoning', token: 'mississauga' }, 'zoning', { minZoom: 14, credit: 'Data © City of Mississauga.' }),
    S('miDevapps', 'Development applications', { muni: 'mississauga' }, { search: 'Active Development Applications', token: 'mississauga' }, 'devapps', { credit: 'Data © City of Mississauga.' }),
    S('miHeritage', 'Heritage properties', { muni: 'mississauga' }, { search: 'Mississauga Heritage Properties', token: 'mississauga' }, 'heritage', { credit: 'Data © City of Mississauga.' }),
    S('brOp', 'Official Plan land use', { muni: 'brampton' }, { item: '04de88d45dd14fa482153796529798a6', layer: 4 }, 'op', { credit: ogl('Brampton') }),
    S('brDevapps', 'Development applications', { muni: 'brampton' }, { search: 'Development Applications', token: 'brampton' }, 'devapps', { credit: ogl('Brampton') }),
    S('brHeritage', 'Heritage', { muni: 'brampton' }, { search: 'Heritage Points', token: 'brampton' }, 'heritage', { credit: ogl('Brampton') }),
    // Halton
    S('oaZoning', 'Zoning (2014-014)', { muni: 'oakville' }, { item: '54d77fc2abd34bc694b4ea1e57e2fa1c', layer: 10 }, 'zoning', { minZoom: 14, credit: ogl('Town of Oakville') }),
    S('oaDevapps', 'Development applications', { muni: 'oakville' }, { item: 'fcae8ad83fe643ae806c30a8ee5c9575' }, 'devapps', { credit: ogl('Town of Oakville') }),
    S('oaHeritage', 'Heritage properties', { muni: 'oakville' }, { search: 'Heritage Properties Open Data', token: 'oakville' }, 'heritage', { credit: ogl('Town of Oakville') }),
    S('buZoning', 'Zoning', { muni: 'burlington' }, { search: 'Zoning Bylaw', token: 'burlington' }, 'zoning', { minZoom: 14, credit: 'Data © City of Burlington.' }),
    S('buHeritage', 'Heritage register', { muni: 'burlington' }, { search: 'Heritage Register', token: 'burlington' }, 'heritage', { credit: 'Data © City of Burlington.' }),
    S('mlZoning', 'Urban zoning (016-2014)', { muni: 'milton' }, { search: 'Urban Zoning By-law 016-2014', token: 'milton' }, 'zoning', { minZoom: 14, credit: 'Data © Town of Milton.' }),
    S('mlDevapps', 'Development applications', { muni: 'milton' }, { search: 'Development Applications', token: 'milton' }, 'devapps', { credit: 'Data © Town of Milton.' }),
    S('mlHeritage', 'Designated heritage', { muni: 'milton' }, { search: 'Designated Heritage Properties', token: 'milton' }, 'heritage', { credit: 'Data © Town of Milton.' }),
    // Hamilton
    S('haZoning', 'Zoning (05-200)', { muni: 'hamilton' }, { item: 'c61604e849b941099bb4319c97048e4d' }, 'zoning', { minZoom: 14, credit: 'Contains public sector data made available under the City of Hamilton’s Open Data Licence.' }),
    S('haDevapps', 'Development applications', { muni: 'hamilton' }, { search: 'Development Applications', token: 'hamilton' }, 'devapps', { credit: 'Contains public sector data made available under the City of Hamilton’s Open Data Licence.' }),
    S('haHeritage', 'Heritage properties', { muni: 'hamilton' }, { search: 'Heritage Properties', token: 'hamilton' }, 'heritage', { credit: 'Contains public sector data made available under the City of Hamilton’s Open Data Licence.' }),
    // York
    S('yrParcels', 'Parcels', { upper: 'york' }, { search: 'Parcel', token: 'york' }, 'parcels', { minZoom: 16, parcels: true, credit: 'Data © The Regional Municipality of York.' }),
    S('yrDevapps', 'Development applications', { upper: 'york' }, { search: 'Active Development Application Boundaries', token: 'york' }, 'devapps', { credit: 'Data © The Regional Municipality of York.' }),
    S('yrRop', 'Regional OP land use', { upper: 'york' }, { item: '1dd6803a7fc4419abd81878b3869de2b' }, 'op', { minZoom: 11, credit: 'Data © The Regional Municipality of York.' }),
    S('yrRow', 'Planned street widths', { upper: 'york' }, { url: 'https://ww7.yorkmaps.ca/arcgis/rest/services/PlanningCadastre/Map12_StreetNetworkAGOL/MapServer/9' }, 'row', { credit: 'Data © The Regional Municipality of York.' }),
    S('nmZoning', 'Zoning', { muni: 'newmarket' }, { item: 'a4bf4420a368408582aaf5fc46d882de', match: /zon/i }, 'zoning', { minZoom: 14, credit: 'Data © Town of Newmarket.' }),
    S('nmOp', 'Official Plan land use', { muni: 'newmarket' }, { item: '3900d105f75e40c3a3a9079509df231b' }, 'op', { credit: 'Data © Town of Newmarket.' }),
    // Durham
    S('drMtsa', 'Protected major transit station areas', { upper: 'durham' }, { item: '4c4a20b337304e1ba8913e87ec5c0194', match: /transit station/i }, 'mtsa', { minZoom: 11, credit: 'Data © The Regional Municipality of Durham.' }),
    S('osParcels', 'Parcels', { muni: 'oshawa' }, { item: '444c69bedab545b8ae819d78555eb4aa', layer: 1 }, 'parcels', { minZoom: 16, parcels: true, credit: 'Data © City of Oshawa.' }),
    S('osZoning', 'Zoning', { muni: 'oshawa' }, { url: 'https://map.oshawa.ca/arcgis/rest/services/Operational/OpenData/MapServer', match: /zon/i }, 'zoning', { minZoom: 14, credit: 'Data © City of Oshawa.' }),
    S('whZoning', 'Zoning', { muni: 'whitby' }, { item: '96aa696d08a54229a405b5876bbf8698', match: /zon/i }, 'zoning', { minZoom: 14, credit: 'Data © Town of Whitby.' }),
    S('ajZoning', 'Zoning', { muni: 'ajax' }, { search: 'Zoning', token: 'ajax' }, 'zoning', { minZoom: 14, credit: 'Data © Town of Ajax.' }),
    S('ajOp', 'Official Plan land use', { muni: 'ajax' }, { item: '8020eafdf35e4b8f97c4a6b156b4d6e5' }, 'op', { credit: 'Data © Town of Ajax.' }),
    S('clZoning', 'Zoning', { muni: 'clarington' }, { item: '3b5019cd3f5447ff9c6851413c8df115', match: /zon/i }, 'zoning', { minZoom: 14, credit: 'Data © Municipality of Clarington.' }),
    S('piDev', 'Major developments & proposals', { muni: 'pickering' }, { item: '164d9a5eb3104525ac844cfba1d329b3', layer: 12 }, 'devapps', { credit: 'Data © City of Pickering.' }),
    // Outer Golden Horseshoe
    S('nfParcels', 'Parcels', { muni: 'niagara falls' }, { url: 'https://services9.arcgis.com/oMFQlUUrLd1Uh1bd/arcgis/rest/services/Niagara_Falls_Property_Parcels/FeatureServer/0' }, 'parcels', { minZoom: 16, parcels: true, credit: ogl('City of Niagara Falls') }),
    S('nfZoning', 'Zoning (79-200)', { muni: 'niagara falls' }, { url: 'https://services9.arcgis.com/oMFQlUUrLd1Uh1bd/arcgis/rest/services/Niagara_Falls_Zoning_Bylaw_79200/FeatureServer/0' }, 'zoning', { minZoom: 14, credit: ogl('City of Niagara Falls') }),
    S('baZoning', 'Zoning', { muni: 'barrie' }, { url: 'https://gispublic.barrie.ca/arcgis/rest/services/Open_Data/Planning/MapServer/0' }, 'zoning', { minZoom: 14, labelFields: ['ZONING', 'DESCRIPT'], credit: 'Data © City of Barrie.' }),
    S('baSitePlan', 'Site plan control', { muni: 'barrie' }, { url: 'https://gispublic.barrie.ca/arcgis/rest/services/Open_Data/Planning/MapServer/1' }, 'sitePlan', { credit: 'Data © City of Barrie.' }),
    S('baMtsa', 'Major transit station areas', { muni: 'barrie' }, { item: '9916e4a860b24f0ebb6e7f62692a7ad6', layer: 4 }, 'mtsa', { minZoom: 11, credit: 'Data © City of Barrie.' }),
    S('waZoning', 'Zoning', { muni: 'waterloo' }, { url: 'https://maps.waterloo.ca/arcgis/rest/services/General/Zoning/MapServer', match: /zon/i }, 'zoning', { minZoom: 14, credit: ogl('City of Waterloo') }),
    S('kiHeritage', 'Heritage properties', { muni: 'kitchener' }, { url: 'https://services1.arcgis.com/qAo1OsXi67t7XgmS/ArcGIS/rest/services/Heritage_Properties/FeatureServer' }, 'heritage', { credit: ogl('City of Kitchener') }),
    S('bfZoning', 'Zoning', { muni: 'brantford' }, { item: '9109012f6418496682621b59e1f6f177', layer: 0 }, 'zoning', { minZoom: 14, credit: ogl('City of Brantford') }),
    S('bfDevapps', 'Planning applications', { muni: 'brantford' }, { item: '939767a48a194b6699554d08bfff8d2e', layer: 0 }, 'devapps', { credit: ogl('City of Brantford') }),
  ];

  // short button labels (the full label is the tooltip)
  const shortName = {
    pvOrm: 'Moraine (ORM)', pvNep: 'Escarpment Plan', pvNhs: 'Natural heritage', pvWetland: 'Wetlands',
    pvAnsi: 'ANSIs', pvBuilt: 'Built-up area', caTrca: 'TRCA limit', caCvc: 'CVC limit', caNpca: 'NPCA limit',
    caLsrca: 'LSRCA limit', caNvca: 'NVCA limit', caHalton: 'Halton CA limit', caCloca: 'CLOCA limit',
    drMtsa: 'Transit station areas', baMtsa: 'Transit station areas', yrRop: 'Regional OP', yrRow: 'Street widths',
    piDev: 'Major developments', baSitePlan: 'Site plan control',
  };
  const phrase = [[/^Official Plan land use$/, 'OP land use'], [/^Development applications$/, 'Dev apps'], [/^Planning applications$/, 'Dev apps'],
    [/^Heritage (properties|register)$/, 'Heritage'], [/^Designated heritage$/, 'Heritage']];
  sources.forEach(s => {
    s.short = shortName[s.k] || phrase.reduce((t, [re, to]) => t.replace(re, to), s.label);
  });

  // Ontario boundaries used to work out where the map is
  const where = {
    muni: LIO + 'LIO_Open03/MapServer/14',
    upper: LIO + 'LIO_Open03/MapServer/13',
    ca: LIO + 'LIO_Open03/MapServer/11',
  };

  const AGOL = 'https://www.arcgis.com/sharing/rest';

  async function getJson(url, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 15000);
    try {
      const r = await fetch(url, { signal: ac.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j && j.error) throw new Error(j.error.message || 'service error ' + (j.error.code || ''));
      return j;
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'timed out' : e.message === 'Failed to fetch' ? 'blocked or unreachable (network or CORS)' : e.message);
    } finally { clearTimeout(t); }
  }

  const q = (params) => new URLSearchParams(Object.assign({ f: 'json' }, params)).toString();
  const isService = (u) => /\/(MapServer|FeatureServer)\/?$/i.test(u);

  // a service URL → one of its layers, by name match or number (default: first layer)
  async function pickLayer(serviceUrl, match, layer) {
    const base = serviceUrl.replace(/\/$/, '');
    if (layer != null) return base + '/' + layer;
    const svc = await getJson(base + '?' + q());
    const layers = (svc.layers || []).filter(l => !l.subLayerIds);
    const hit = match ? layers.find(l => match.test(l.name)) : layers[0];
    if (!hit) throw new Error(match ? 'no layer named like ' + match : 'service has no layers');
    return base + '/' + hit.id;
  }

  // a web map → the URL of the operational layer whose title matches
  async function fromWebMap(id, match) {
    const data = await getJson(AGOL + '/content/items/' + id + '/data?' + q());
    const flat = [];
    const walk = (ls) => (ls || []).forEach(l => { flat.push(l); walk(l.layers); });
    walk(data.operationalLayers);
    const hit = flat.find(l => l.url && (!match || match.test(l.title || '') || match.test(l.url)));
    if (!hit) throw new Error('web map has no layer matching ' + match);
    return isService(hit.url) ? pickLayer(hit.url, match) : hit.url;
  }

  async function fromItem(id, src) {
    const it = await getJson(AGOL + '/content/items/' + id + '?' + q());
    if (it.type === 'Web Map') return { url: await fromWebMap(id, src.match), item: it };
    if (!it.url) throw new Error('item is a ' + it.type + ', not a map service');
    return { url: isService(it.url) ? await pickLayer(it.url, src.match, src.layer) : it.url, item: it };
  }

  async function fromSearch(src) {
    const query = 'title:"' + src.search + '" AND ' + src.token + ' AND (type:"Feature Service" OR type:"Map Service")';
    const res = await getJson(AGOL + '/search?' + q({ q: query, num: 50 }));
    const want = src.search.toLowerCase(), tok = src.token.toLowerCase();
    const hit = (res.results || []).find(it => (it.title || '').toLowerCase() === want &&
      [it.owner, it.url, it.title, it.snippet, it.description, it.accessInformation].join(' ').toLowerCase().includes(tok));
    if (!hit) throw new Error('no public item titled "' + src.search + '" for ' + src.token);
    return { url: isService(hit.url) ? await pickLayer(hit.url, src.match, src.layer) : hit.url, item: hit };
  }

  // → { url (layer), meta (layer JSON), geojson (bool), via, item }
  async function resolve(src) {
    let found;
    if (src.url) found = { url: isService(src.url) ? await pickLayer(src.url, src.match, src.layer) : src.url, via: 'url' };
    else if (src.item) found = Object.assign(await fromItem(src.item, src), { via: 'item' });
    else if (src.search) found = Object.assign(await fromSearch(src), { via: 'search' });
    else throw new Error('source has no url, item or search');
    const meta = await getJson(found.url + '?' + q());
    if (meta.type && !/layer/i.test(meta.type)) throw new Error('not a feature layer (' + meta.type + ')');
    found.meta = meta;
    found.geojson = /geojson/i.test(meta.supportedQueryFormats || '');
    return found;
  }

  // Esri JSON features → GeoJSON (points, lines and polygons; enough for display)
  function esriToGeo(j) {
    const features = (j.features || []).map(f => {
      const g = f.geometry || {};
      let geometry = null;
      if (g.x != null) geometry = { type: 'Point', coordinates: [g.x, g.y] };
      else if (g.points) geometry = { type: 'MultiPoint', coordinates: g.points };
      else if (g.paths) geometry = { type: 'MultiLineString', coordinates: g.paths };
      else if (g.rings) geometry = { type: 'Polygon', coordinates: g.rings };
      return geometry ? { type: 'Feature', geometry, properties: f.attributes || {} } : null;
    }).filter(Boolean);
    return { type: 'FeatureCollection', features };
  }

  // features in an envelope, as GeoJSON; falls back to Esri JSON, then to no record limit
  async function query(found, params) {
    const url = found.url + '/query?';
    const base = Object.assign({ outFields: '*', returnGeometry: 'true', inSR: '4326', outSR: '4326' }, params);
    const tries = [];
    if (found.geojson) tries.push(() => getJson(url + q(Object.assign({}, base, { f: 'geojson' }))));
    tries.push(() => getJson(url + q(base)).then(esriToGeo));
    const noLimit = Object.assign({}, base); delete noLimit.resultRecordCount;
    tries.push(() => getJson(url + q(noLimit)).then(esriToGeo));
    let err;
    for (const t of tries) {
      try { const j = await t(); if (j && Array.isArray(j.features)) return j; } catch (e) { err = e; }
    }
    throw err || new Error('no features');
  }

  // a readable label for a feature: preferred fields, else the layer's display field, else
  // the first short text value
  function labelOf(src, meta, a) {
    const skip = /^(objectid|fid|shape|globalid|oid)/i;
    for (const f of (src.labelFields || [])) if (a[f] != null && a[f] !== '') return String(a[f]);
    if (meta && meta.displayField && a[meta.displayField] != null && a[meta.displayField] !== '') return String(a[meta.displayField]);
    for (const [k, v] of Object.entries(a)) if (!skip.test(k) && typeof v === 'string' && v.trim() && v.length < 80) return v;
    return '';
  }

  // which municipality, upper tier and conservation authority contain a point
  async function locate(lat, lng) {
    const params = {
      geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: '*', returnGeometry: 'false',
    };
    const one = async (url) => {
      try {
        const j = await getJson(url + '/query?' + q(params), 12000);
        const a = (j.features && j.features[0] && j.features[0].attributes) || null;
        if (!a) return null;
        const vals = Object.entries(a).filter(([, v]) => typeof v === 'string' && v.trim());
        const nameKey = ['MUNICIPAL_NAME_SHORTFORM', 'OFFICIAL_MUNICIPAL_NAME', 'MUNICIPAL_NAME', 'LEGAL_NAME', 'NAME']
          .find(k => a[k]) || (vals.find(([k]) => /name/i.test(k)) || [])[0];
        return { name: nameKey ? String(a[nameKey]) : (vals[0] || [])[1] || '', text: vals.map(([, v]) => v).join(' | ').toLowerCase() };
      } catch (e) { return null; }
    };
    const [muni, upper, ca] = await Promise.all([one(where.muni), one(where.upper), one(where.ca)]);
    return { muni, upper, ca, ok: !!(muni || upper || ca) };
  }

  // does a source apply at this place? (unknown place: everything applies)
  function applies(src, place) {
    const a = src.area || {};
    if (a.prov) return true;
    if (!place || !place.ok) return true;
    // whole words in the boundary's name only: "Hamilton" must not match "milton", and a
    // lower-tier record that also names its region must not match that region's token
    const has = (part, tok) => {
      const p = place[part];
      return !!p && new RegExp('\\b' + tok.replace(/ /g, '\\s+') + '\\b').test((p.name || p.text).toLowerCase());
    };
    // "halton" also appears in "Halton Hills": upper-tier tokens only test the upper tier
    if (a.muni) return has('muni', a.muni);
    if (a.upper) return has('upper', a.upper);
    if (a.ca) return has('ca', a.ca);
    return false;
  }

  function placeName(place) {
    if (!place || !place.ok) return '';
    const tidy = (s) => String(s || '').toLowerCase().replace(/\b(the )?(corporation of the |regional municipality of |city of |town(ship)? of |municipality of |county of )/g, '').replace(/\b\w/g, c => c.toUpperCase()).trim();
    return tidy(place.muni && place.muni.name) || tidy(place.upper && place.upper.name);
  }

  window.SPM = { sources, where, resolve, query, labelOf, locate, applies, placeName, esriToGeo };
})();
