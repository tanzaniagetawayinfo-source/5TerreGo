#!/usr/bin/env node

import { inflateRawSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CKAN_API = 'https://dati.regione.liguria.it/api/3/action/package_show?id=ds-640';
const OUTPUT_PATH = path.resolve('data/atc-bus-stops.json');
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

  for (const stopTime of stopTimes) {
    if (!activeTripIds.has(stopTime.trip_id)) continue;
    const trip = tripById.get(stopTime.trip_id);
    if (!stopUsage.has(stopTime.stop_id)) stopUsage.set(stopTime.stop_id, { routes: new Set(), services: new Set() });
    stopUsage.get(stopTime.stop_id).routes.add(trip.route_id);
    stopUsage.get(stopTime.stop_id).services.add(trip.service_id);
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

  return {
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

const dataset = await buildDataset();
await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(dataset)}\n`, 'utf8');
if (args.has('--upsert')) await upsertDataset(dataset);
console.log(JSON.stringify({ output: OUTPUT_PATH, upserted: args.has('--upsert'), ...dataset.counts, period_start: dataset.period_start, period_end: dataset.period_end }, null, 2));
