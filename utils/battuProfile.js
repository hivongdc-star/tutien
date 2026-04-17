const fs = require('fs');
const path = require('path');

const profilePath = path.join(__dirname, '..', 'data', 'battu_profiles.json');

function ensureFile() {
  if (!fs.existsSync(profilePath)) {
    fs.writeFileSync(profilePath, '{}');
  }
}

function loadProfiles() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveProfiles(data) {
  ensureFile();
  fs.writeFileSync(profilePath, JSON.stringify(data, null, 2));
}

function getBattuProfile(userId) {
  const all = loadProfiles();
  return all[userId] || null;
}

function setBattuProfile(userId, profile) {
  const all = loadProfiles();
  all[userId] = profile;
  saveProfiles(all);
  return all[userId];
}

function resetBattuProfile(userId) {
  const all = loadProfiles();
  if (!all[userId]) return false;
  delete all[userId];
  saveProfiles(all);
  return true;
}

module.exports = {
  loadProfiles,
  saveProfiles,
  getBattuProfile,
  setBattuProfile,
  resetBattuProfile,
};
