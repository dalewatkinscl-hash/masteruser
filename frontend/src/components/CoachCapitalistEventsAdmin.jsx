import React, { useState, useMemo } from 'react';
import { DEFAULT_EVENTS, formatMoney } from '../lib/coachCapitalist';
import { GameUiButton, GameUiModal } from './gameUi';

const EMOJI_PRESETS = ['🚨', '📋', '⚠️', '⏱️', '⛽', '🔧', '🚌', '⚽', '🚆', '✈️', '🎪', '💼', '🛞', '🌧️', '⚡', '🏆'];

export default function CoachCapitalistEventsAdmin({
  events = [],
  onChangeEvents,
  onSaveConfig,
  saving = false,
  onTestSpawn,
}) {
  const [filter, setFilter] = useState('all'); // all | positive | negative | first_allowed | chasers_only
  const [editingEvent, setEditingEvent] = useState(null); // null or event object
  const [modalOpen, setModalOpen] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');

  const currentEvents = useMemo(() => {
    return Array.isArray(events) && events.length > 0 ? events : DEFAULT_EVENTS;
  }, [events]);

  const totalWeight = useMemo(() => {
    return currentEvents
      .filter((e) => e.enabled !== false)
      .reduce((sum, e) => sum + Math.max(1, Number(e.weight) || 10), 0);
  }, [currentEvents]);

  const filteredEvents = useMemo(() => {
    return currentEvents.filter((e) => {
      if (filter === 'positive') return e.category === 'positive';
      if (filter === 'negative') return e.category === 'negative';
      if (filter === 'first_allowed') return e.spawnForFirstPlace !== false;
      if (filter === 'chasers_only') return e.spawnForFirstPlace === false;
      return true;
    });
  }, [currentEvents, filter]);

  const handleToggleEnabled = (eventId) => {
    const next = currentEvents.map((e) => (e.id === eventId ? { ...e, enabled: e.enabled === false } : e));
    onChangeEvents(next);
  };

  const handleToggleFirstPlace = (eventId) => {
    const next = currentEvents.map((e) =>
      e.id === eventId ? { ...e, spawnForFirstPlace: e.spawnForFirstPlace === false } : e
    );
    onChangeEvents(next);
  };

  const handleDeleteEvent = (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event template?')) return;
    const next = currentEvents.filter((e) => e.id !== eventId);
    onChangeEvents(next);
  };

  const handleResetDefaults = () => {
    if (!window.confirm('Reset all events back to the canonical default set? Any custom events will be replaced.')) return;
    onChangeEvents(DEFAULT_EVENTS);
  };

  const handleSaveModal = (savedEvent) => {
    const exists = currentEvents.some((e) => e.id === savedEvent.id);
    let next;
    if (exists) {
      next = currentEvents.map((e) => (e.id === savedEvent.id ? savedEvent : e));
    } else {
      next = [...currentEvents, savedEvent];
    }
    onChangeEvents(next);
    setModalOpen(false);
    setEditingEvent(null);
  };

  const handleCloudSave = async () => {
    if (!onSaveConfig) return;
    const ok = await onSaveConfig(currentEvents);
    if (ok) {
      setSaveSuccessMessage('Events saved to cloud successfully for all players!');
      window.setTimeout(() => setSaveSuccessMessage(''), 4000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-700">
        <div>
          <h3 className="gui-font text-base sm:text-lg text-amber-300 flex items-center gap-2">
            <span>🎪 Coach Capitalist Events &amp; Crisis Management</span>
          </h3>
          <p className="text-xs text-slate-300 mt-0.5">
            Configure random VIP charters, rail surges, and negative breakdown crises. Events roll periodically during active play.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GameUiButton
            size="sm"
            variant="primary"
            onClick={() => {
              setEditingEvent({
                id: `event-${Date.now().toString(36)}`,
                title: '⚠️ Fleet Event Alert',
                subtitle: 'Operations dispatch notification',
                category: 'negative',
                kind: 'penalty_breakdown',
                reactionSec: 15,
                actionLabel: '🔧 Dispatch Recovery Fitter',
                penaltyLabel: '0.5× Fleet Speed for 60s',
                penaltyDurationSec: 60,
                penaltySpeedMult: 0.5,
                weight: 15,
                spawnForFirstPlace: true,
                enabled: true,
              });
              setModalOpen(true);
            }}
          >
            + Create New Event
          </GameUiButton>
          <GameUiButton size="sm" variant="success" disabled={saving} onClick={handleCloudSave}>
            {saving ? 'Saving…' : '💾 Save to Cloud'}
          </GameUiButton>
          <GameUiButton size="sm" variant="neutral" onClick={handleResetDefaults} title="Restore standard Country Lion presets">
            ↺ Defaults
          </GameUiButton>
        </div>
      </div>

      {saveSuccessMessage && (
        <div className="rounded-lg bg-emerald-500/20 border border-emerald-500/50 px-3 py-2 text-xs font-semibold text-emerald-200">
          ✓ {saveSuccessMessage}
        </div>
      )}

      {/* Filter and summary pills */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-400 font-medium mr-1">Filter:</span>
          {[
            ['all', `All (${currentEvents.length})`],
            ['positive', `Positive (${currentEvents.filter((e) => e.category === 'positive').length})`],
            ['negative', `Negative / Crises (${currentEvents.filter((e) => e.category === 'negative').length})`],
            ['first_allowed', `Spawns for #1 (${currentEvents.filter((e) => e.spawnForFirstPlace !== false).length})`],
            ['chasers_only', `Chasers Only (${currentEvents.filter((e) => e.spawnForFirstPlace === false).length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                filter === key
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-slate-400 text-[11px]">
          Total active weight pool: <strong className="text-amber-300 font-mono">{totalWeight}</strong>
        </div>
      </div>

      {/* Events Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredEvents.map((evt) => {
          const isNegative = evt.category === 'negative';
          const isEnabled = evt.enabled !== false;
          const weight = Math.max(1, Number(evt.weight) || 10);
          const chancePct = isEnabled && totalWeight > 0 ? ((weight / totalWeight) * 100).toFixed(1) : '0';
          const allowsFirst = evt.spawnForFirstPlace !== false;

          return (
            <div
              key={evt.id}
              className={`rounded-xl border p-3.5 space-y-2.5 transition relative flex flex-col justify-between ${
                !isEnabled
                  ? 'opacity-50 border-slate-800 bg-slate-900/40'
                  : isNegative
                    ? 'border-rose-500/40 bg-gradient-to-br from-rose-950/30 via-slate-900/60 to-slate-900/90 shadow-sm'
                    : 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-slate-900/60 to-slate-900/90 shadow-sm'
              }`}
            >
              <div>
                {/* Title & Badges */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="gui-font text-sm text-slate-100 font-bold truncate flex items-center gap-1.5">
                      <span>{evt.title}</span>
                    </p>
                    <p className="text-xs text-slate-300/80 mt-0.5 line-clamp-2">{evt.subtitle}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                      isNegative
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {isNegative ? '🚨 Hazard / Crisis' : '✨ VIP Bonus'}
                  </span>
                </div>

                {/* Effect Specs */}
                <div className="mt-2.5 space-y-1.5 text-[11px] bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Effect / Mechanism:</span>
                    <span className="font-semibold text-slate-200">
                      {evt.kind === 'cash' && `💷 Instant Payout (${evt.secondsOfRps || 45}s of £/s)`}
                      {evt.kind === 'frenzy' && `🔥 ${evt.speedMultiplier || 2}× All-Fleet Speed (${evt.durationSec || 60}s)`}
                      {evt.kind === 'fleet' && `🎁 +${evt.minQty || 2} to +${evt.maxQty || 4} Free Yard Vehicles`}
                      {evt.kind === 'penalty_fine' && `💸 Fine if unhandled (${evt.secondsOfRps || 30}s £/s or ${(Number(evt.cashPercent || 0.05) * 100).toFixed(0)}% cash)`}
                      {evt.kind === 'penalty_breakdown' && `⚠️ Breakdown if unhandled (${evt.penaltySpeedMult || 0.5}× speed for ${evt.penaltyDurationSec || 60}s)`}
                    </span>
                  </div>

                  {isNegative && (
                    <div className="flex items-center justify-between text-rose-300">
                      <span>Penalty if ignored:</span>
                      <span className="font-semibold">{evt.penaltyLabel || 'Half fleet speed for 60s'}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Reaction Window:</span>
                    <span className="font-mono text-amber-300">{evt.reactionSec || 15} seconds</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Spawn Chance:</span>
                    <span className="font-mono text-sky-300">
                      Weight {weight} (~{chancePct}%)
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Spawns for 1st Place:</span>
                    <button
                      type="button"
                      onClick={() => handleToggleFirstPlace(evt.id)}
                      className={`text-[10px] font-bold rounded px-1.5 py-0.5 border ${
                        allowsFirst
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                          : 'border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                      }`}
                      title="Click to toggle whether this event can spawn for whoever holds #1 on the leaderboard"
                    >
                      {allowsFirst ? '✓ Yes (Spawns for #1)' : '✕ No (Chasers Only)'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(evt.id)}
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold border ${
                      isEnabled
                        ? 'border-slate-600 bg-slate-800 text-slate-300 hover:text-white'
                        : 'border-emerald-600 bg-emerald-950 text-emerald-300 hover:bg-emerald-900'
                    }`}
                  >
                    {isEnabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEvent({ ...evt });
                      setModalOpen(true);
                    }}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:text-white"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(evt.id)}
                    className="rounded border border-rose-900/60 bg-rose-950/40 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-900/50"
                  >
                    🗑️
                  </button>
                </div>
                {onTestSpawn && (
                  <GameUiButton
                    size="sm"
                    variant={isNegative ? 'danger' : 'warning'}
                    onClick={() => onTestSpawn(evt)}
                    title="Trigger this event immediately on your game board to test visual, timers, and effects"
                  >
                    ⚡ Test Spawn
                  </GameUiButton>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && editingEvent && (
        <EditEventModal
          event={editingEvent}
          onClose={() => {
            setModalOpen(false);
            setEditingEvent(null);
          }}
          onSave={handleSaveModal}
        />
      )}
    </div>
  );
}

function EditEventModal({ event, onClose, onSave }) {
  const [formData, setFormData] = useState({
    id: event.id || `event-${Date.now().toString(36)}`,
    title: event.title || '⚽ Event Title',
    subtitle: event.subtitle || 'Event lore and flavor description',
    category: event.category || 'positive',
    kind: event.kind || (event.category === 'negative' ? 'penalty_breakdown' : 'cash'),
    secondsOfRps: Number(event.secondsOfRps) || 45,
    durationSec: Number(event.durationSec) || 60,
    speedMultiplier: Number(event.speedMultiplier) || 2,
    minQty: Number(event.minQty) || 2,
    maxQty: Number(event.maxQty) || 4,
    penaltyLabel: event.penaltyLabel || '0.5× Fleet Speed for 60s',
    penaltyDurationSec: Number(event.penaltyDurationSec) || 60,
    penaltySpeedMult: Number(event.penaltySpeedMult) || 0.5,
    cashPercent: Number(event.cashPercent) || 0.05,
    actionLabel: event.actionLabel || (event.category === 'negative' ? '🔧 Resolve Crisis' : 'Accept Charter'),
    reactionSec: Number(event.reactionSec) || 15,
    weight: Number(event.weight) || 15,
    spawnForFirstPlace: event.spawnForFirstPlace !== false,
    enabled: event.enabled !== false,
  });

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'category') {
        if (value === 'negative' && !next.kind.startsWith('penalty_')) {
          next.kind = 'penalty_breakdown';
          next.actionLabel = '🔧 Dispatch Recovery';
          next.penaltyLabel = '0.5× Fleet Speed for 60s';
        } else if (value === 'positive' && next.kind.startsWith('penalty_')) {
          next.kind = 'cash';
          next.actionLabel = 'Accept Charter';
        }
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    onSave(formData);
  };

  return (
    <GameUiModal open onClose={onClose} title={event.id ? 'Edit Event Template' : 'Create New Event'}>
      <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        {/* Category Radio */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1">Event Category</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleChange('category', 'positive')}
              className={`p-2.5 rounded-lg border text-left flex items-center gap-2 ${
                formData.category === 'positive'
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200'
                  : 'border-slate-700 bg-slate-800 text-slate-400'
              }`}
            >
              <span className="text-lg">✨</span>
              <div>
                <p className="font-bold">Positive Bonus</p>
                <p className="text-[10px] opacity-80">VIP charters, extra payouts, speed frenzies</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleChange('category', 'negative')}
              className={`p-2.5 rounded-lg border text-left flex items-center gap-2 ${
                formData.category === 'negative'
                  ? 'border-rose-500 bg-rose-500/15 text-rose-200'
                  : 'border-slate-700 bg-slate-800 text-slate-400'
              }`}
            >
              <span className="text-lg">🚨</span>
              <div>
                <p className="font-bold">Negative Crisis</p>
                <p className="text-[10px] opacity-80">Breakdowns, roadside audits, penalties if ignored</p>
              </div>
            </button>
          </div>
        </div>

        {/* Title & Emojis */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1">Event Title</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-white"
              placeholder="e.g. 🚨 M1 Motorway Axle Failure"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            <span className="text-[10px] text-slate-500 mr-1">Quick Icons:</span>
            {EMOJI_PRESETS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => {
                  const cleaned = formData.title.replace(/^[\p{Emoji}\s]+/u, '').trim();
                  handleChange('title', `${icon} ${cleaned}`);
                }}
                className="rounded hover:bg-slate-700 px-1 py-0.5 text-sm"
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Subtitle / Description */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1">Subtitle / Lore Description</label>
          <textarea
            rows={2}
            value={formData.subtitle}
            onChange={(e) => handleChange('subtitle', e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-white"
            placeholder="Flavor description displayed in the game alert banner..."
          />
        </div>

        {/* Kind / Mechanism */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Effect Type</label>
            <select
              value={formData.kind}
              onChange={(e) => handleChange('kind', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white"
            >
              {formData.category === 'positive' ? (
                <>
                  <option value="cash">💷 Instant Cash Payout (seconds of £/s)</option>
                  <option value="frenzy">🔥 All-Fleet Speed Frenzy</option>
                  <option value="fleet">🎁 Free Yard Vehicles</option>
                </>
              ) : (
                <>
                  <option value="penalty_breakdown">⚠️ Depot Breakdown (Speed Penalty)</option>
                  <option value="penalty_fine">💸 Enforcement Fine (Cash Deduction)</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Action Button Text</label>
            <input
              type="text"
              value={formData.actionLabel}
              onChange={(e) => handleChange('actionLabel', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-white"
              placeholder={formData.category === 'negative' ? '🔧 Dispatch Recovery' : 'Accept Charter'}
            />
          </div>
        </div>

        {/* Kind Specific Inputs */}
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
          {formData.kind === 'cash' && (
            <div>
              <label className="block text-slate-400 font-medium mb-1">Seconds of Automated Revenue (£/s) Awarded</label>
              <input
                type="number"
                min={10}
                max={600}
                value={formData.secondsOfRps}
                onChange={(e) => handleChange('secondsOfRps', Number(e.target.value))}
                className="w-32 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
              />
            </div>
          )}

          {formData.kind === 'frenzy' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Speed Multiplier (e.g. 2 for 2×)</label>
                <input
                  type="number"
                  min={1.5}
                  max={10}
                  step={0.5}
                  value={formData.speedMultiplier}
                  onChange={(e) => handleChange('speedMultiplier', Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-medium mb-1">Duration (Seconds)</label>
                <input
                  type="number"
                  min={15}
                  max={300}
                  value={formData.durationSec}
                  onChange={(e) => handleChange('durationSec', Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                />
              </div>
            </div>
          )}

          {formData.kind === 'penalty_breakdown' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Penalty Speed Multiplier (e.g. 0.5 = 50% speed)</label>
                  <input
                    type="number"
                    min={0.1}
                    max={0.9}
                    step={0.1}
                    value={formData.penaltySpeedMult}
                    onChange={(e) => handleChange('penaltySpeedMult', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Penalty Duration (Seconds)</label>
                  <input
                    type="number"
                    min={15}
                    max={300}
                    value={formData.penaltyDurationSec}
                    onChange={(e) => handleChange('penaltyDurationSec', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 font-medium mb-1">Penalty Warning Label</label>
                <input
                  type="text"
                  value={formData.penaltyLabel}
                  onChange={(e) => handleChange('penaltyLabel', e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                  placeholder="e.g. 0.5× Fleet Speed for 60s"
                />
              </div>
            </div>
          )}

          {formData.kind === 'penalty_fine' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Fine: Seconds of £/s</label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={formData.secondsOfRps}
                    onChange={(e) => handleChange('secondsOfRps', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Or % of Cash Wallet (e.g. 0.05 = 5%)</label>
                  <input
                    type="number"
                    min={0.01}
                    max={0.5}
                    step={0.01}
                    value={formData.cashPercent}
                    onChange={(e) => handleChange('cashPercent', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 font-medium mb-1">Penalty Warning Label</label>
                <input
                  type="text"
                  value={formData.penaltyLabel}
                  onChange={(e) => handleChange('penaltyLabel', e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                  placeholder="e.g. DVSA Fine of 30s revenue"
                />
              </div>
            </div>
          )}
        </div>

        {/* Reaction Time, Weight & First Place Allowed */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Reaction Window</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={5}
                max={60}
                value={formData.reactionSec}
                onChange={(e) => handleChange('reactionSec', Number(e.target.value))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
              />
              <span className="text-slate-400">sec</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Time to click before penalty/expiry</p>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Spawn Weight</label>
            <input
              type="number"
              min={1}
              max={100}
              value={formData.weight}
              onChange={(e) => handleChange('weight', Number(e.target.value))}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
            />
            <p className="text-[10px] text-slate-500 mt-0.5">Higher = spawns more often</p>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Spawns for 1st Place</label>
            <label className="flex items-center gap-2 mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.spawnForFirstPlace}
                onChange={(e) => handleChange('spawnForFirstPlace', e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-amber-500"
              />
              <span className="text-slate-300 text-xs font-medium">
                {formData.spawnForFirstPlace ? '✓ Allowed for #1' : '✕ Exclude #1 (Chasers Only)'}
              </span>
            </label>
            <p className="text-[10px] text-slate-500 mt-0.5">Catch-up mechanic control</p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <GameUiButton size="sm" variant="neutral" onClick={onClose}>
            Cancel
          </GameUiButton>
          <GameUiButton size="sm" variant="primary" type="submit">
            Save Event
          </GameUiButton>
        </div>
      </form>
    </GameUiModal>
  );
}
