const fs = require('fs');
const path = require('path');

const cache = new Map();

function readJson(file) {
  const p = path.join(__dirname, '..', 'data', file);
  if (cache.has(p)) return cache.get(p);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  cache.set(p, data);
  return data;
}

function loadBattuData() {
  const stems = readJson('battu_stems.json');
  const branches = readJson('battu_branches.json');
  const hiddenStems = readJson('battu_hidden_stems.json');
  const relations = readJson('battu_relations.json');
  const monthStemRules = readJson('battu_month_stem_rules.json');
  const hourStemRules = readJson('battu_hour_stem_rules.json');
  const tenGods = readJson('battu_tengods.json');
  const content = readJson('battu_content.json');
  const dailyTiers = readJson('battu_daily_tiers.json');
  const dailyGuides = readJson('battu_daily_guides.json');
  const solarTerms = readJson('battu_solar_terms.json');
  const ruleset = readJson('battu_ruleset.json');
  const sources = readJson('battu_sources.json');
  const trigrams = readJson('battu_trigrams.json');
  const growthStages = readJson('battu_growth_stages.json');
  const shensha = readJson('battu_shensha.json');
  const patterns = readJson('battu_patterns.json');

  const stemByName = Object.fromEntries(stems.map((x) => [x.name, x]));
  const branchByName = Object.fromEntries(branches.map((x) => [x.name, x]));
  const stemIndex = Object.fromEntries(stems.map((x, i) => [x.name, i]));
  const branchIndex = Object.fromEntries(branches.map((x, i) => [x.name, i]));
  const trigramByKey = Object.fromEntries(trigrams.map((x) => [`${x.element}:${x.polarity}`, x]));

  return {
    stems,
    branches,
    hiddenStems,
    relations,
    monthStemRules,
    hourStemRules,
    tenGods,
    content,
    dailyTiers,
    dailyGuides,
    solarTerms,
    ruleset,
    sources,
    trigrams,
    growthStages,
    shensha,
    patterns,
    stemByName,
    branchByName,
    stemIndex,
    branchIndex,
    trigramByKey,
  };
}

module.exports = { loadBattuData };
