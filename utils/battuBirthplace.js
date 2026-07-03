const fs = require('fs');
const path = require('path');

let cache = null;

function loadBirthPlaces() {
  if (cache) return cache;
  const p = path.join(__dirname, '..', 'data', 'vietnam_birthplaces.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  cache = raw;
  return cache;
}

function getBirthPlaceById(id) {
  if (!id) return null;
  const { places } = loadBirthPlaces();
  return places.find((x) => x.id === id) || null;
}

function getBirthPlacesByRegion(region) {
  const { places } = loadBirthPlaces();
  return places.filter((x) => x.region === region);
}

function normalizeLongitude(value) {
  const n = Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (n < 102 || n > 110) return null;
  return Math.round(n * 10000) / 10000;
}

function makeCustomBirthPlace(longitude) {
  const lon = normalizeLongitude(longitude);
  if (lon === null) return null;
  return {
    id: `custom_${String(lon).replace('.', '_')}`,
    name: `Kinh độ ${lon.toFixed(4)}°E`,
    region: 'custom',
    longitude: lon,
    isCustom: true,
  };
}

module.exports = {
  loadBirthPlaces,
  getBirthPlaceById,
  getBirthPlacesByRegion,
  normalizeLongitude,
  makeCustomBirthPlace,
};
