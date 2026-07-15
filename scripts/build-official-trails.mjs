import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const OSM_API = 'https://api.openstreetmap.org/api/0.6';
const ELEVATION_API = 'https://api.open-meteo.com/v1/elevation';
const OUTPUT = resolve('data/official-trails.json');
const USER_AGENT = '5TerreGo trail data validation 5terrego.info@gmail.com';

const definitions = [
  {
    name: '592-3 (SVA2) Corniglia - Vernazza',
    relationId: 7797964,
    startAnchor: [44.120665, 9.709935],
    endAnchor: [44.134763, 9.683522],
    description: 'Tratto costiero ufficiale SVA2 tra Corniglia e Vernazza, con scalinate, passaggi stretti e ampi panorami sul mare. Richiede passo sicuro, calzature da trekking e verifica preventiva dello stato di apertura. L’accesso può richiedere la Cinque Terre Card.',
    difficulty: 'expert',
    estimated_duration: '1h 30m',
    shoe_type: 'boots',
    importance: 98,
    is_free: false,
    start_name: 'Corniglia',
    end_name: 'Vernazza',
    distance_km: 4.137,
    elevation_gain_m: 269,
    official_url: 'https://www.parconazionale5terre.it/iti_dettaglio.php?id_iti=3577'
  },
  {
    name: '592-4 (SVA2) Vernazza - Monterosso',
    relationId: 7797964,
    startAnchor: [44.134763, 9.683522],
    endAnchor: [44.14658, 9.65442],
    description: 'Tratto ufficiale SVA2 fra Vernazza e Monterosso, panoramico ma impegnativo, con numerosi gradini e sezioni strette. Servono scarpe da trekking. Nei giorni di maggiore affluenza possono essere introdotti sensi unici temporanei: controllare sempre gli avvisi del Parco. L’accesso può richiedere la Cinque Terre Card.',
    difficulty: 'expert',
    estimated_duration: '2h',
    shoe_type: 'boots',
    importance: 97,
    is_free: false,
    start_name: 'Vernazza',
    end_name: 'Monterosso',
    distance_km: 3.668,
    elevation_gain_m: 217,
    official_url: 'https://www.parconazionale5terre.it/iti_dettaglio.php?id_iti=3578'
  },
  {
    name: '587 (ex n. 7A) Corniglia - Cigoletta',
    relationId: 4589706,
    description: 'Itinerario ufficiale che sale da Corniglia verso Cigoletta attraversando fasce terrazzate e ambiente boschivo. Il dislivello è importante e il fondo può essere irregolare: sono consigliati scarponcini con buona aderenza e adeguata preparazione.',
    difficulty: 'expert',
    estimated_duration: '2h 20m',
    shoe_type: 'boots',
    importance: 82,
    is_free: true,
    start_name: 'Corniglia',
    end_name: 'Cigoletta',
    distance_km: 2.363,
    elevation_gain_m: 502,
    official_url: 'https://www.parconazionale5terre.it/iti_dettaglio.php?id_iti=3470'
  }
];

function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function nearestIndex(points, anchor) {
  let best = 0;
  let bestDistance = Infinity;
  points.forEach((point, index) => {
    const distance = haversine(point, anchor);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  if (bestDistance > 0.12) throw new Error(`Anchor too far from route: ${bestDistance.toFixed(3)} km`);
  return best;
}

async function fetchRelation(relationId) {
  const response = await fetch(`${OSM_API}/relation/${relationId}/full.json`, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`OSM relation ${relationId}: HTTP ${response.status}`);
  const data = await response.json();
  const nodes = new Map(data.elements.filter((x) => x.type === 'node').map((x) => [x.id, [x.lat, x.lon]]));
  const ways = new Map(data.elements.filter((x) => x.type === 'way').map((x) => [x.id, x.nodes.map((id) => nodes.get(id)).filter(Boolean)]));
  const relation = data.elements.find((x) => x.type === 'relation' && x.id === relationId);
  if (!relation) throw new Error(`Relation ${relationId} missing`);
  const members = relation.members.filter((x) => x.type === 'way').map((x) => ways.get(x.ref)).filter((x) => x && x.length > 1);
  if (!members.length) throw new Error(`Relation ${relationId} has no usable ways`);
  const route = members[0].slice();
  for (let i = 1; i < members.length; i += 1) {
    const part = members[i];
    const last = route[route.length - 1];
    const direct = haversine(last, part[0]);
    const reverse = haversine(last, part[part.length - 1]);
    const ordered = reverse < direct ? part.slice().reverse() : part;
    if (Math.min(direct, reverse) > 0.04) throw new Error(`Gap in relation ${relationId}: ${Math.min(direct, reverse).toFixed(3)} km`);
    route.push(...ordered.slice(haversine(last, ordered[0]) < 0.002 ? 1 : 0));
  }
  return route;
}

function sliceBetween(points, startAnchor, endAnchor) {
  if (!startAnchor || !endAnchor) return points;
  const start = nearestIndex(points, startAnchor);
  const end = nearestIndex(points, endAnchor);
  return start <= end ? points.slice(start, end + 1) : points.slice(end, start + 1).reverse();
}

function simplify(points, limit = 110) {
  if (points.length <= limit) return points;
  const result = [];
  for (let i = 0; i < limit; i += 1) result.push(points[Math.round((i / (limit - 1)) * (points.length - 1))]);
  return result.filter((point, index) => index === 0 || haversine(point, result[index - 1]) > 0.0005);
}

async function elevations(points) {
  const values = [];
  for (let offset = 0; offset < points.length; offset += 80) {
    const batch = points.slice(offset, offset + 80);
    const url = new URL(ELEVATION_API);
    url.searchParams.set('latitude', batch.map((p) => p[0].toFixed(6)).join(','));
    url.searchParams.set('longitude', batch.map((p) => p[1].toFixed(6)).join(','));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Elevation API: HTTP ${response.status}`);
    const data = await response.json();
    values.push(...data.elevation.map(Number));
  }
  return values;
}

function elevationProfile(points, elevationValues, officialDistance) {
  const geometric = [0];
  for (let i = 1; i < points.length; i += 1) geometric.push(geometric[i - 1] + haversine(points[i - 1], points[i]));
  const scale = geometric[geometric.length - 1] ? officialDistance / geometric[geometric.length - 1] : 1;
  return points.map((point, index) => ({
    distanceKm: Number((geometric[index] * scale).toFixed(3)),
    elevation: Number(elevationValues[index].toFixed(1))
  }));
}

function calculatedLoss(profile, officialGain) {
  if (profile.length < 2) return 0;
  const start = profile[0].elevation;
  const end = profile[profile.length - 1].elevation;
  return Math.max(0, Math.round(Number(officialGain || 0) + start - end));
}

const relationCache = new Map();
const trails = [];
for (const definition of definitions) {
  if (!relationCache.has(definition.relationId)) relationCache.set(definition.relationId, await fetchRelation(definition.relationId));
  const fullRoute = relationCache.get(definition.relationId);
  const route = sliceBetween(fullRoute, definition.startAnchor, definition.endAnchor);
  const profilePoints = simplify(route);
  const profile = elevationProfile(profilePoints, await elevations(profilePoints), definition.distance_km);
  trails.push({
    ...definition,
    price_amount: 0,
    price_currency: 'EUR',
    elevation_loss_m: calculatedLoss(profile, definition.elevation_gain_m),
    elevation_profile: profile,
    points: route.map(([lat, lng]) => ({ lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) })),
    route_geojson: {
      type: 'Feature',
      properties: { source: 'OpenStreetMap', relation_id: definition.relationId },
      geometry: { type: 'LineString', coordinates: route.map(([lat, lng]) => [Number(lng.toFixed(7)), Number(lat.toFixed(7))]) }
    }
  });
}

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, JSON.stringify({ generated_at: new Date().toISOString(), trails }, null, 2) + '\n');
console.log(`Wrote ${trails.length} official trails to ${OUTPUT}`);
trails.forEach((trail) => console.log(`${trail.name}: ${trail.points.length} points, ${trail.distance_km} km, +${trail.elevation_gain_m}/-${trail.elevation_loss_m} m`));
