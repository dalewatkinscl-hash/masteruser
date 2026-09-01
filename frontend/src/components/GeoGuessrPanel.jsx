import { useCallback, useEffect, useRef, useState } from 'react';
import { Viewer } from 'mapillary-js';
import L from 'leaflet';
import 'mapillary-js/dist/mapillary.css';
import 'leaflet/dist/leaflet.css';
import {
  ROUND_SECONDS,
  MAX_SCORE,
  getMapillaryAccessToken,
  haversineKm,
  scoreFromDistanceKm,
  formatDistance,
  formatTimer,
  resolvePuzzleGeometry,
} from '../lib/geoguessr';

function GuessMap({
  enabled,
  guess,
  truth,
  finished,
  onGuess,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const guessMarkerRef = useRef(null);
  const truthMarkerRef = useRef(null);
  const lineRef = useRef(null);
  const enabledRef = useRef(enabled);
  const onGuessRef = useRef(onGuess);
  enabledRef.current = enabled;
  onGuessRef.current = onGuess;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = L.map(containerRef.current, {
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 18,
    }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    const onClick = (e) => {
      if (!enabledRef.current) return;
      onGuessRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    map.on('click', onClick);

    const resizeId = setTimeout(() => map.invalidateSize(), 50);
    return () => {
      clearTimeout(resizeId);
      map.off('click', onClick);
      map.remove();
      mapRef.current = null;
      guessMarkerRef.current = null;
      truthMarkerRef.current = null;
      lineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setTimeout(() => map.invalidateSize(), 50);
  }, [enabled, finished]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (guessMarkerRef.current) {
      map.removeLayer(guessMarkerRef.current);
      guessMarkerRef.current = null;
    }
    if (guess) {
      guessMarkerRef.current = L.circleMarker([guess.lat, guess.lng], {
        radius: 8,
        color: '#818cf8',
        fillColor: '#6366f1',
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map);
    }

    if (truthMarkerRef.current) {
      map.removeLayer(truthMarkerRef.current);
      truthMarkerRef.current = null;
    }
    if (lineRef.current) {
      map.removeLayer(lineRef.current);
      lineRef.current = null;
    }

    if (finished && truth) {
      truthMarkerRef.current = L.circleMarker([truth.lat, truth.lng], {
        radius: 8,
        color: '#34d399',
        fillColor: '#10b981',
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map);
      if (guess) {
        lineRef.current = L.polyline(
          [
            [guess.lat, guess.lng],
            [truth.lat, truth.lng],
          ],
          { color: '#fbbf24', weight: 2, dashArray: '6 4' },
        ).addTo(map);
        map.fitBounds(
          L.latLngBounds([
            [guess.lat, guess.lng],
            [truth.lat, truth.lng],
          ]).pad(0.35),
        );
      } else {
        map.setView([truth.lat, truth.lng], 6);
      }
    }
  }, [guess, truth, finished]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[220px] rounded-xl overflow-hidden border border-[#1a2540] bg-[#060e1a] z-0"
    />
  );
}

export default function GeoGuessrPanel({ puzzle, sandbox = true, accessToken: accessTokenProp }) {
  const accessToken = (accessTokenProp ?? getMapillaryAccessToken() ?? '').trim();
  const streetRef = useRef(null);
  const viewerRef = useRef(null);

  const [resolved, setResolved] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loadingPuzzle, setLoadingPuzzle] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [remaining, setRemaining] = useState(ROUND_SECONDS);
  const [guess, setGuess] = useState(null);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState(null);
  const finishingRef = useRef(false);
  const guessRef = useRef(null);

  const playing = Boolean(startedAt) && !finished;
  const showStreet = Boolean(startedAt);

  useEffect(() => {
    guessRef.current = guess;
  }, [guess]);

  useEffect(() => {
    let cancelled = false;
    finishingRef.current = false;
    setResolved(null);
    setLoadError('');
    setStartedAt(null);
    setRemaining(ROUND_SECONDS);
    setGuess(null);
    setFinished(false);
    setResult(null);

    if (!puzzle?.imageId && !(Number.isFinite(puzzle?.lat) && Number.isFinite(puzzle?.lng))) {
      return undefined;
    }

    (async () => {
      try {
        setLoadingPuzzle(true);
        const next = await resolvePuzzleGeometry(puzzle, accessToken);
        if (!cancelled) setResolved(next);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Failed to load puzzle.');
      } finally {
        if (!cancelled) setLoadingPuzzle(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [puzzle, accessToken]);

  useEffect(() => {
    if (!showStreet || !streetRef.current || !resolved?.imageId || !accessToken) {
      return undefined;
    }

    let viewer;
    try {
      viewer = new Viewer({
        accessToken,
        container: streetRef.current,
        imageId: resolved.imageId,
        component: {
          cover: false,
          direction: false,
          sequence: false,
          spatial: false,
          tag: false,
          popup: false,
          image: true,
          pointer: true,
          zoom: true,
          attribution: true,
        },
      });
      viewer.deactivateCombinedPanning();
      viewerRef.current = viewer;
    } catch (err) {
      setLoadError(err.message || 'Failed to start Mapillary viewer.');
      return undefined;
    }

    const onResize = () => {
      try {
        viewer.resize();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('resize', onResize);
    const resizeId = setTimeout(onResize, 80);

    return () => {
      clearTimeout(resizeId);
      window.removeEventListener('resize', onResize);
      try {
        viewer.remove();
      } catch {
        /* ignore */
      }
      viewerRef.current = null;
    };
  }, [showStreet, resolved, accessToken]);

  const finishRound = useCallback((finalGuess) => {
    if (finishingRef.current || !resolved) return;
    finishingRef.current = true;
    const g = finalGuess || null;
    let distanceKm = null;
    let score = 0;
    if (g && Number.isFinite(resolved.lat) && Number.isFinite(resolved.lng)) {
      distanceKm = haversineKm(g.lat, g.lng, resolved.lat, resolved.lng);
      score = scoreFromDistanceKm(distanceKm);
    }
    if (g) setGuess(g);
    setFinished(true);
    setResult({
      distanceKm,
      score,
      maxScore: MAX_SCORE,
    });
  }, [resolved]);

  useEffect(() => {
    if (!startedAt || finished) return undefined;
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, ROUND_SECONDS - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        finishRound(guessRef.current);
      }
    }, 250);
    return () => clearInterval(id);
  }, [startedAt, finished, finishRound]);

  const onStart = () => {
    if (!resolved || startedAt || finished || !accessToken) return;
    setStartedAt(Date.now());
    setRemaining(ROUND_SECONDS);
  };

  const onGuessClick = useCallback((point) => {
    if (!playing) return;
    setGuess(point);
  }, [playing]);

  if (!puzzle?.imageId && !(Number.isFinite(puzzle?.lat) && Number.isFinite(puzzle?.lng))) {
    return (
      <p className="text-sm text-slate-400">
        Choose a seed location or enter a Mapillary image ID / coordinates to play.
      </p>
    );
  }

  if (!accessToken) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
        <p className="text-sm text-amber-100 font-medium">Mapillary token required</p>
        <p className="text-xs text-slate-300 leading-relaxed">
          Create a Mapillary app at{' '}
          <a
            className="text-indigo-300 hover:underline"
            href="https://www.mapillary.com/dashboard/developers"
            target="_blank"
            rel="noreferrer"
          >
            mapillary.com/dashboard/developers
          </a>
          , copy the client access token, then paste it in the Mapillary token box above and click Save.
        </p>
      </div>
    );
  }

  if (loadingPuzzle) {
    return <p className="text-sm text-slate-400">Loading puzzle…</p>;
  }

  if (loadError) {
    return <p className="text-sm text-rose-300">{loadError}</p>;
  }

  return (
    <div className="space-y-3">
      {sandbox ? (
        <p className="text-xs text-amber-200/90">Admin sandbox · not saved</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="text-sm text-slate-100 font-medium">
            {resolved?.label || 'GeoGuessr'}
          </p>
          <p className="text-xs text-slate-500">
            One view · pan &amp; zoom only · {ROUND_SECONDS / 60} min · score by distance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {startedAt ? (
            <span
              className={`font-mono text-lg tabular-nums ${
                remaining <= 30 ? 'text-rose-300' : 'text-indigo-200'
              }`}
            >
              {formatTimer(remaining)}
            </span>
          ) : null}
          {!startedAt && !finished ? (
            <button
              type="button"
              onClick={onStart}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium text-white"
            >
              Start
            </button>
          ) : null}
          {playing ? (
            <button
              type="button"
              disabled={!guess}
              onClick={() => finishRound(guess)}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white"
            >
              Guess
            </button>
          ) : null}
          {finished ? (
            <button
              type="button"
              onClick={() => {
                finishingRef.current = false;
                setStartedAt(null);
                setRemaining(ROUND_SECONDS);
                setGuess(null);
                setFinished(false);
                setResult(null);
              }}
              className="rounded-lg border border-[#1a2540] px-4 py-2 text-sm text-slate-200 hover:bg-[#0b1220]"
            >
              Play again
            </button>
          ) : null}
        </div>
      </div>

      {result ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-slate-100">
          Score <span className="font-semibold text-emerald-200">{result.score}</span>
          {' / '}
          {result.maxScore}
          {result.distanceKm != null ? (
            <>
              {' · '}
              {formatDistance(result.distanceKm)} away
            </>
          ) : (
            ' · no pin placed'
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Street view</p>
          <div
            ref={streetRef}
            className="w-full h-[320px] sm:h-[380px] rounded-xl overflow-hidden border border-[#1a2540] bg-[#060e1a]"
          >
            {!showStreet ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 px-4 text-center">
                Press Start to reveal the location (pan &amp; zoom only).
              </div>
            ) : null}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500">
            {finished ? 'Result map' : 'Guess map · click to place pin'}
          </p>
          <div className="h-[320px] sm:h-[380px]">
            <GuessMap
              enabled={playing}
              guess={guess}
              truth={
                finished && resolved
                  ? { lat: resolved.lat, lng: resolved.lng }
                  : null
              }
              finished={finished}
              onGuess={onGuessClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
