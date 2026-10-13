/**
 * Accident triage penalty trigger catalog.
 * Points = highest band among selected triggers.
 */

const ACCIDENT_PENALTY_TRIGGERS = [
  { id: 'cl_damage_under_400', label: 'Damage to our vehicle under £400', points: 1 },
  { id: 'cl_damage_over_400', label: 'Damage to our vehicle over £400', points: 2 },
  { id: 'potential_injury', label: 'Potential to cause injury', points: 2 },
  { id: 'poor_observation', label: 'Poor observation was major factor', points: 2 },
  { id: 'third_party_damage', label: 'Damage to 3rd party vehicle or property', points: 2 },
  { id: 'excessive_speed', label: 'Excessive speed — significantly exceeding the limit or too fast for conditions', points: 3 },
  { id: 'aggressive_manoeuvring', label: 'Aggressive manoeuvring — weaving, tailgating, or similar', points: 3 },
  { id: 'impairment', label: 'Impairment — alcohol or drugs', points: 3 },
  { id: 'ignoring_traffic_laws', label: 'Ignoring traffic laws — signals, signs, or basic road safety rules', points: 3 },
  { id: 'serious_injury_or_death', label: 'Causing serious injury or death', points: 3 },
  { id: 'significant_vehicle_damage', label: 'Significant damage to vehicle', points: 3 },
];

const TRIGGER_BY_ID = Object.fromEntries(ACCIDENT_PENALTY_TRIGGERS.map((item) => [item.id, item]));

function sanitizeAccidentPenaltyTriggers(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const triggers = [];
  for (const item of list) {
    const id = String(item || '').trim();
    if (!id || seen.has(id) || !TRIGGER_BY_ID[id]) continue;
    seen.add(id);
    triggers.push(id);
  }
  return triggers;
}

function computeAccidentPenaltyPoints(triggerIds) {
  let max = 0;
  for (const id of sanitizeAccidentPenaltyTriggers(triggerIds)) {
    const band = TRIGGER_BY_ID[id]?.points || 0;
    if (band > max) max = band;
  }
  return max;
}

function accidentPenaltyTriggerLabels(triggerIds) {
  return sanitizeAccidentPenaltyTriggers(triggerIds)
    .map((id) => TRIGGER_BY_ID[id]?.label || id);
}

function groupAccidentPenaltyTriggers() {
  return [1, 2, 3].map((points) => ({
    points,
    triggers: ACCIDENT_PENALTY_TRIGGERS.filter((item) => item.points === points),
  }));
}

module.exports = {
  ACCIDENT_PENALTY_TRIGGERS,
  sanitizeAccidentPenaltyTriggers,
  computeAccidentPenaltyPoints,
  accidentPenaltyTriggerLabels,
  groupAccidentPenaltyTriggers,
};
