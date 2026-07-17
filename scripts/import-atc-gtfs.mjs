#!/usr/bin/env node

import { inflateRawSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CKAN_API = 'https://dati.regione.liguria.it/api/3/action/package_show?id=ds-640';
const OUTPUT_PATH = path.resolve('data/atc-bus-stops.json');
const SCHEDULE_OUTPUT_PATH = path.resolve('data/atc-transit-schedule.json');
const args = new Set(process.argv.slice(2));

function parseDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{8}$/.test(text)) throw new Error(`Invalid GTFS date: ${text}`);
  return new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00Z`);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function parseGtfsTime(value) {
  const match = String(value || '').match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function encodePolyline(points) {
  let previousLat = 0;
  let previousLon = 0;
  let output = '';
  function encodeNumber(number) {
    let value = number < 0 ? ~(number << 1) : number << 1;
    while (value >= 0x20) {
      output += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    output += String.fromCharCode(value + 63);
  }
  for (const point of points) {
    const lat = Math.round(Number(point.shape_pt_lat) * 1e5);
    const lon = Math.round(Number(point.shape_pt_lon) * 1e5);
    encodeNumber(lat - previousLat);
    encodeNumber(lon - previousLon);
    previousLat = lat;
    previousLon = lon;
  }
  return output;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  const headers = (rows.shift() || []).map((value) => value.replace(/^\uFEFF/, ''));
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function unzipEntries(buffer) {
  const entries = new Map();
  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Invalid GTFS ZIP: central directory not found.');
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid GTFS ZIP central directory.');
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local ZIP entry for ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = compression === 0 ? compressed : compression === 8 ? inflateRawSync(compressed) : null;
    if (!content) throw new Error(`Unsupported ZIP compression ${compression} for ${name}`);
    entries.set(path.basename(name), content.toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function requireRows(entries, name) {
  const text = entries.get(name);
  if (!text) throw new Error(`Missing ${name} in ATC GTFS.`);
  return parseCsv(text);
}

function enumerateCalendarServiceDates(calendarRows, start, end) {
  const active = new Map();
  const dayFields = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (const row of calendarRows) {
    const rowStart = parseDate(row.start_date);
    const rowEnd = parseDate(row.end_date);
    const rangeStart = rowStart > start ? rowStart : start;
    const rangeEnd = rowEnd < end ? rowEnd : end;
    for (let date = rangeStart; date <= rangeEnd; date = addDays(date, 1)) {
      if (row[dayFields[date.getUTCDay()]] === '1') {
        if (!active.has(row.service_id)) active.set(row.service_id, new Set());
        active.get(row.service_id).add(formatDate(date));
      }
    }
  }
  return active;
}

function applyCalendarDates(active, rows, start, end) {
  for (const row of rows) {
    const date = parseDate(row.date);
    if (date < start || date > end) continue;
    if (!active.has(row.service_id)) active.set(row.service_id, new Set());
    if (row.exception_type === '1') active.get(row.service_id).add(formatDate(date));
    if (row.exception_type === '2') active.get(row.service_id).delete(formatDate(date));
  }
  for (const [serviceId, dates] of active) if (!dates.size) active.delete(serviceId);
  return active;
}

async function getFeed() {
  if (process.env.ATC_GTFS_ZIP) {
    return { sourceUrl: `file://${path.resolve(process.env.ATC_GTFS_ZIP)}`, buffer: await readFile(process.env.ATC_GTFS_ZIP) };
  }
  const metadataResponse = await fetch(CKAN_API);
  if (!metadataResponse.ok) throw new Error(`CKAN returned ${metadataResponse.status}`);
  const metadata = await metadataResponse.json();
  const resource = metadata.result.resources.find((item) => item.name === 'Servizio di scarico GTFS') || metadata.result.resources.find((item) => /GTFS/i.test(item.name));
  if (!resource || !resource.url) throw new Error('Official ATC GTFS resource not found.');
  const feedResponse = await fetch(resource.url);
  if (!feedResponse.ok) throw new Error(`ATC GTFS returned ${feedResponse.status}`);
  return { sourceUrl: resource.url, buffer: Buffer.from(await feedResponse.arrayBuffer()) };
}

async function buildDataset() {
  const { sourceUrl, buffer } = await getFeed();
  const entries = unzipEntries(buffer);
  const feedInfo = requireRows(entries, 'feed_info.txt')[0];
  const stops = requireRows(entries, 'stops.txt');
  const stopTimes = requireRows(entries, 'stop_times.txt');
  const trips = requireRows(entries, 'trips.txt');
  const routes = requireRows(entries, 'routes.txt');
  const shapes = requireRows(entries, 'shapes.txt');
  const calendar = entries.has('calendar.txt') ? requireRows(entries, 'calendar.txt') : [];
  const calendarDates = entries.has('calendar_dates.txt') ? requireRows(entries, 'calendar_dates.txt') : [];
  const feedStart = parseDate(feedInfo.feed_start_date);
  const feedEnd = parseDate(feedInfo.feed_end_date);
  const requestedDate = process.env.ATC_PERIOD_START ? new Date(`${process.env.ATC_PERIOD_START}T00:00:00Z`) : new Date();
  requestedDate.setUTCHours(0, 0, 0, 0);
  const periodStart = requestedDate > feedStart ? requestedDate : feedStart;
  if (periodStart > feedEnd) throw new Error(`Official feed expired on ${formatDate(feedEnd)}.`);

  const activeServices = applyCalendarDates(enumerateCalendarServiceDates(calendar, periodStart, feedEnd), calendarDates, periodStart, feedEnd);
  const activeTrips = trips.filter((trip) => activeServices.has(trip.service_id));
  const activeTripIds = new Set(activeTrips.map((trip) => trip.trip_id));
  const tripById = new Map(activeTrips.map((trip) => [trip.trip_id, trip]));
  const routeById = new Map(routes.map((route) => [route.route_id, route]));
  const stopUsage = new Map();
  const stopTimesByTrip = new Map();

  for (const stopTime of stopTimes) {
    if (!activeTripIds.has(stopTime.trip_id)) continue;
    const trip = tripById.get(stopTime.trip_id);
    if (!stopUsage.has(stopTime.stop_id)) stopUsage.set(stopTime.stop_id, { routes: new Set(), services: new Set() });
    stopUsage.get(stopTime.stop_id).routes.add(trip.route_id);
    stopUsage.get(stopTime.stop_id).services.add(trip.service_id);
    if (!stopTimesByTrip.has(stopTime.trip_id)) stopTimesByTrip.set(stopTime.trip_id, []);
    stopTimesByTrip.get(stopTime.trip_id).push(stopTime);
  }

  const filteredStops = stops.filter((stop) => stopUsage.has(stop.stop_id)).map((stop) => {
    const usage = stopUsage.get(stop.stop_id);
    return {
      stop_id: stop.stop_id,
      stop_name: stop.stop_name,
      stop_lat: Number(stop.stop_lat),
      stop_lon: Number(stop.stop_lon),
      zone_id: stop.zone_id || null,
      wheelchair_boarding: Number(stop.wheelchair_boarding || 0),
      routes: [...usage.routes].sort().map((routeId) => {
        const route = routeById.get(routeId) || {};
        return { route_id: routeId, short_name: route.route_short_name || '', long_name: route.route_long_name || '' };
      }),
      service_ids: [...usage.services].sort(),
      feed_start_date: formatDate(feedStart),
      feed_end_date: formatDate(feedEnd),
      source_url: sourceUrl
    };
  });

  const stopsDataset = {
    source: 'Regione Liguria / ATC Esercizio',
    source_url: sourceUrl,
    generated_at: new Date().toISOString(),
    period_start: formatDate(periodStart),
    period_end: formatDate(feedEnd),
    counts: {
      source_stops: stops.length,
      active_stops: filteredStops.length,
      excluded_stops: stops.length - filteredStops.length,
      active_trips: activeTrips.length,
      active_routes: new Set(activeTrips.map((trip) => trip.route_id)).size,
      active_services: activeServices.size
    },
    stops: filteredStops
  };

  const activeShapeIds = new Set(activeTrips.map((trip) => trip.shape_id).filter(Boolean));
  const shapePoints = new Map();
  for (const point of shapes) {
    if (!activeShapeIds.has(point.shape_id)) continue;
    if (!shapePoints.has(point.shape_id)) shapePoints.set(point.shape_id, []);
    shapePoints.get(point.shape_id).push(point);
  }
  const compactShapes = {};
  for (const [shapeId, points] of shapePoints) {
    points.sort((a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence));
    const last = points[points.length - 1] || {};
    compactShapes[shapeId] = [encodePolyline(points), Number(last.shape_dist_traveled || 0)];
  }
  const compactTrips = activeTrips.map((trip) => {
    const times = (stopTimesByTrip.get(trip.trip_id) || []).sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence)).map((stopTime) => [
      stopTime.stop_id,
      parseGtfsTime(stopTime.arrival_time),
      parseGtfsTime(stopTime.departure_time),
      Number(stopTime.shape_dist_traveled || 0)
    ]).filter((stopTime) => stopTime[1] !== null && stopTime[2] !== null);
    return [trip.trip_id, trip.route_id, trip.service_id, trip.shape_id, trip.trip_headsign || '', Number(trip.direction_id || 0), times];
  }).filter((trip) => trip[6].length >= 2 && compactShapes[trip[3]]);
  const compactStops = Object.fromEntries(filteredStops.map((stop) => [stop.stop_id, [stop.stop_name, stop.stop_lat, stop.stop_lon]]));
  const compactRoutes = Object.fromEntries(routes.filter((route) => compactTrips.some((trip) => trip[1] === route.route_id)).map((route) => [route.route_id, [route.route_short_name || '', route.route_long_name || '', route.route_color || '003366']]));
  const compactServices = Object.fromEntries([...activeServices].map(([serviceId, dates]) => [serviceId, [...dates].sort().map((date) => date.replaceAll('-', ''))]));
  const scheduleDataset = {
    version: 1,
    source: stopsDataset.source,
    source_url: sourceUrl,
    generated_at: stopsDataset.generated_at,
    feed_end_date: stopsDataset.period_end,
    stops: compactStops,
    routes: compactRoutes,
    services: compactServices,
    trips: compactTrips,
    shapes: compactShapes
  };

  return { stopsDataset, scheduleDataset };
}

async function upsertDataset(dataset) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required with --upsert.');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
  for (let index = 0; index < dataset.stops.length; index += 250) {
    const response = await fetch(`${url}/rest/v1/atc_bus_stops?on_conflict=stop_id`, { method: 'POST', headers, body: JSON.stringify(dataset.stops.slice(index, index + 250)) });
    if (!response.ok) throw new Error(`Supabase upsert failed: ${response.status} ${await response.text()}`);
  }
  const currentIds = new Set(dataset.stops.map((stop) => stop.stop_id));
  const existingResponse = await fetch(`${url}/rest/v1/atc_bus_stops?select=stop_id`, { headers });
  if (!existingResponse.ok) throw new Error(`Supabase read failed: ${existingResponse.status}`);
  const staleIds = (await existingResponse.json()).map((row) => row.stop_id).filter((stopId) => !currentIds.has(stopId));
  for (let index = 0; index < staleIds.length; index += 100) {
    const encoded = staleIds.slice(index, index + 100).map((id) => `"${String(id).replaceAll('"', '\\"')}"`).join(',');
    const response = await fetch(`${url}/rest/v1/atc_bus_stops?stop_id=in.(${encodeURIComponent(encoded)})`, { method: 'DELETE', headers });
    if (!response.ok) throw new Error(`Supabase stale-row cleanup failed: ${response.status} ${await response.text()}`);
  }
}

const { stopsDataset: dataset, scheduleDataset } = await buildDataset();
await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(dataset)}\n`, 'utf8');
await writeFile(SCHEDULE_OUTPUT_PATH, `${JSON.stringify(scheduleDataset)}\n`, 'utf8');
if (args.has('--upsert')) await upsertDataset(dataset);
console.log(JSON.stringify({ output: OUTPUT_PATH, schedule_output: SCHEDULE_OUTPUT_PATH, schedule_trips: scheduleDataset.trips.length, schedule_shapes: Object.keys(scheduleDataset.shapes).length, upserted: args.has('--upsert'), ...dataset.counts, period_start: dataset.period_start, period_end: dataset.period_end }, null, 2));
