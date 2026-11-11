import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ROW_TEXT_COLORS = {
  navy: '#000080',
  teal: '#008080',
  brown: '#804000',
};

function formatIsoToUk(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function shiftIsoDays(iso, deltaDays) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date();
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function StatusCellIcon({ status, hasMagnifier }) {
  return (
    <span className="inline-flex items-center justify-center gap-0.5 leading-none select-none">
      {hasMagnifier ? (
        <span title="Has stop instructions / details" className="text-[10px]">
          🔍
        </span>
      ) : null}
      {status === 'confirmed' ? (
        <span
          title="Confirmed / Accepted"
          className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-700"
        />
      ) : (
        <span
          title="Allocated / Scheduled"
          className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-200 border border-sky-700"
        />
      )}
    </span>
  );
}

export default function CoachManagerReplica() {
  // Default to today's date (2026-11-10 in London), with a 1-click button to view 13/11/2024 screenshot preset
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [activeTopTab, setActiveTopTab] = useState('grid'); // 'grid' | 'reports'
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Top filter controls matching Coach Manager toolbar
  const [showPrivateHires, setShowPrivateHires] = useState(true);
  const [showContracts, setShowContracts] = useState(true);
  const [showProvisionalOnly, setShowProvisionalOnly] = useState(false);
  const [baseFilter, setBaseFilter] = useState('All');
  const [bookingTypeFilter, setBookingTypeFilter] = useState('All');
  const [seatsFilter, setSeatsFilter] = useState('All');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('All');
  const [driverTypeFilter, setDriverTypeFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [worksheet, setWorksheet] = useState(null);

  // Interactive selection states
  // bottomMode: 'driver' (default when clicking a driver on bottom-right or a trip row)
  //             'vehicle' (when clicking a vehicle on top-right)
  const [bottomMode, setBottomMode] = useState('driver');
  const [selectedDriverId, setSelectedDriverId] = useState('AB');
  const [selectedVehicleId, setSelectedVehicleId] = useState('120A15CLN');
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const reqCounter = useRef(0);

  const fetchWorksheet = useCallback(async (dateToLoad, forceRefresh = false) => {
    const reqId = ++reqCounter.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        tab: 'coach-manager',
        date: dateToLoad,
      });
      if (forceRefresh) params.set('refresh', 'true');

      const res = await fetch(`/api/getFinanceReports?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (reqId !== reqCounter.current) return;

      if (!res.ok || !json.ok || !json.data?.coachManager) {
        setError(json.error || 'Failed to load Coach Manager daily worksheet.');
        setLoading(false);
        return;
      }

      const cm = json.data.coachManager;
      setWorksheet(cm);
      setCollapsedGroups({});

      // Initialize selection to first available trip / driver / vehicle
      if (cm.trips && cm.trips.length > 0) {
        const preferredTrip =
          cm.trips.find((t) => t.id === 'CM-AB-3') ||
          cm.trips.find((t) => t.driverId === 'AB') ||
          cm.trips[0];
        setSelectedTripId(preferredTrip.id);
        setSelectedDriverId(preferredTrip.driverId);
        if (preferredTrip.vehicleId && preferredTrip.vehicleId !== 'UNALLOC') {
          setSelectedVehicleId(preferredTrip.vehicleId);
        } else if (cm.vehicles?.[0]) {
          setSelectedVehicleId(cm.vehicles[0].vehicleId);
        }
      } else {
        setSelectedTripId(null);
        if (cm.drivers?.[0]) setSelectedDriverId(cm.drivers[0].driverId);
        if (cm.vehicles?.[0]) setSelectedVehicleId(cm.vehicles[0].vehicleId);
      }
      setLoading(false);
    } catch (err) {
      if (reqId !== reqCounter.current) return;
      setError(err.message || 'Network error loading Coach Manager worksheet.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWorksheet(selectedDate, false);
  }, [selectedDate, fetchWorksheet]);

  // Filtered trips for the main top-left grid
  const filteredTrips = useMemo(() => {
    const list = worksheet?.trips || [];
    const q = searchQuery.trim().toLowerCase();

    return list.filter((t) => {
      if (!showPrivateHires && t.isPrivateHire) return false;
      if (!showContracts && t.isContract) return false;
      if (showProvisionalOnly && !t.isProvisional) return false;
      if (baseFilter !== 'All' && t.base !== baseFilter) return false;
      if (bookingTypeFilter !== 'All' && t.bookingType !== bookingTypeFilter) return false;
      if (seatsFilter !== 'All' && String(t.seats) !== String(seatsFilter)) return false;
      if (vehicleTypeFilter !== 'All' && t.vehicleType !== vehicleTypeFilter) return false;
      if (driverTypeFilter !== 'All' && t.driverType !== driverTypeFilter) return false;
      if (q) {
        const hay = `${t.driverId} ${t.driverName} ${t.vehicleId} ${t.licensePlate} ${t.pickupPoint} ${t.destination} ${t.bookingId} ${t.clientCompany}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    worksheet,
    showPrivateHires,
    showContracts,
    showProvisionalOnly,
    baseFilter,
    bookingTypeFilter,
    seatsFilter,
    vehicleTypeFilter,
    driverTypeFilter,
    searchQuery,
  ]);

  // Group filtered trips by Driver ID (Driver Initial) in alphabetical order
  const groupedByDriver = useMemo(() => {
    const map = new Map();
    for (const trip of filteredTrips) {
      const key = trip.driverId || 'UNALLOC';
      if (!map.has(key)) {
        map.set(key, {
          driverId: key,
          driverName: trip.driverName || key,
          trips: [],
        });
      }
      map.get(key).trips.push(trip);
    }
    return [...map.values()];
  }, [filteredTrips]);

  // Currently selected trip object for the Middle Inspector Strip
  const selectedTrip = useMemo(() => {
    if (!worksheet?.trips?.length) return null;
    return (
      worksheet.trips.find((t) => t.id === selectedTripId) ||
      filteredTrips[0] ||
      worksheet.trips[0] ||
      null
    );
  }, [worksheet, selectedTripId, filteredTrips]);

  // Index of selected trip in filteredTrips for the record navigator bar
  const selectedTripIndex = useMemo(() => {
    if (!selectedTrip || !filteredTrips.length) return 0;
    const idx = filteredTrips.findIndex((t) => t.id === selectedTrip.id);
    return idx >= 0 ? idx + 1 : 1;
  }, [selectedTrip, filteredTrips]);

  // Selected Driver metadata for Bottom panel
  const selectedDriverMeta = useMemo(() => {
    const drivers = worksheet?.drivers || [];
    const found = drivers.find((d) => d.driverId === selectedDriverId);
    if (found) return found;
    const fromTrip = worksheet?.trips?.find((t) => t.driverId === selectedDriverId);
    if (fromTrip) {
      return {
        driverId: fromTrip.driverId,
        driverName: fromTrip.driverName,
        driverType: fromTrip.driverType || 'Driver',
        partTime: false,
        secondary: false,
        logEntry: fromTrip.logEntry || 'Lunch',
        comment: fromTrip.comment || 'Office',
      };
    }
    return {
      driverId: selectedDriverId || '—',
      driverName: 'No driver selected',
      driverType: 'Driver',
      partTime: false,
      secondary: false,
      logEntry: 'Lunch',
      comment: 'Office',
    };
  }, [worksheet, selectedDriverId]);

  // Selected Vehicle metadata for Bottom panel
  const selectedVehicleMeta = useMemo(() => {
    const vehicles = worksheet?.vehicles || [];
    const found = vehicles.find((v) => v.vehicleId === selectedVehicleId);
    if (found) return found;
    const fromTrip = worksheet?.trips?.find((t) => t.vehicleId === selectedVehicleId);
    if (fromTrip) {
      return {
        vehicleId: fromTrip.vehicleId,
        licensePlate: fromTrip.licensePlate || '',
        vehicleType: fromTrip.vehicleType || 'Coach',
        seats: fromTrip.seats || 53,
        base: fromTrip.base || 'Northampton',
      };
    }
    return {
      vehicleId: selectedVehicleId || '—',
      licensePlate: '',
      vehicleType: 'Coach',
      seats: 53,
      base: 'Northampton',
    };
  }, [worksheet, selectedVehicleId]);

  // Bottom panel allocated work rows:
  // - If bottomMode === 'vehicle', shows all trips allocated to selectedVehicleId on that date
  // - If bottomMode === 'driver', shows all trips allocated to selectedDriverId on that date
  const bottomAllocatedTrips = useMemo(() => {
    const allTrips = worksheet?.trips || [];
    if (bottomMode === 'vehicle') {
      return allTrips
        .filter((t) => t.vehicleId === selectedVehicleId)
        .sort((a, b) => a.start.localeCompare(b.start));
    }
    return allTrips
      .filter((t) => t.driverId === selectedDriverId)
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [worksheet, bottomMode, selectedVehicleId, selectedDriverId]);

  // Handlers
  const handleSelectTripRow = (trip) => {
    setSelectedTripId(trip.id);
    if (trip.driverId) setSelectedDriverId(trip.driverId);
    if (trip.vehicleId && trip.vehicleId !== 'UNALLOC') {
      setSelectedVehicleId(trip.vehicleId);
    }
    setBottomMode('driver');
  };

  const handleClickVehicleRightTop = (veh) => {
    setSelectedVehicleId(veh.vehicleId);
    setBottomMode('vehicle');
    // Also select the first trip for this vehicle so the middle inspector updates immediately
    const firstVehTrip = (worksheet?.trips || []).find((t) => t.vehicleId === veh.vehicleId);
    if (firstVehTrip) {
      setSelectedTripId(firstVehTrip.id);
      if (firstVehTrip.driverId) {
        setSelectedDriverId(firstVehTrip.driverId);
      }
    }
  };

  const handleClickDriverRightBottom = (drv) => {
    setSelectedDriverId(drv.driverId);
    setBottomMode('driver');
    // Expand that driver's group if collapsed
    setCollapsedGroups((prev) => ({ ...prev, [drv.driverId]: false }));
    // Also select the first trip for this driver so the middle inspector updates immediately
    const firstDrvTrip = (worksheet?.trips || []).find((t) => t.driverId === drv.driverId);
    if (firstDrvTrip) {
      setSelectedTripId(firstDrvTrip.id);
      if (firstDrvTrip.vehicleId && firstDrvTrip.vehicleId !== 'UNALLOC') {
        setSelectedVehicleId(firstDrvTrip.vehicleId);
      }
    }
  };

  const toggleDriverGroup = (driverId) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [driverId]: !prev[driverId],
    }));
  };

  const expandOrCollapseAll = (collapse) => {
    if (!collapse) {
      setCollapsedGroups({});
      return;
    }
    const next = {};
    for (const g of groupedByDriver) {
      next[g.driverId] = true;
    }
    setCollapsedGroups(next);
  };

  const navigateRecord = (targetIndexOneBased) => {
    if (!filteredTrips.length) return;
    const clamped = Math.max(1, Math.min(filteredTrips.length, targetIndexOneBased));
    const target = filteredTrips[clamped - 1];
    if (target) handleSelectTripRow(target);
  };

  const handleClearFilters = () => {
    setShowPrivateHires(true);
    setShowContracts(true);
    setShowProvisionalOnly(false);
    setBaseFilter('All');
    setBookingTypeFilter('All');
    setSeatsFilter('All');
    setVehicleTypeFilter('All');
    setDriverTypeFilter('All');
    setSearchQuery('');
  };

  const handleExportCsv = () => {
    if (!filteredTrips.length) return;
    const headers = [
      'Driver ID',
      'Driver Name',
      'Driver Type',
      'Start',
      'Pick-up',
      'Pickup Point',
      'Destination',
      'Arrival',
      'Leave',
      'Back',
      'Finish',
      'Seats',
      'Vehicle Type',
      'Vehicle ID',
      'Booking Type',
      'Booking ID',
      'Client ID',
      'Client Company',
    ];
    const rows = filteredTrips.map((t) =>
      [
        t.driverId,
        t.driverName,
        t.driverType,
        t.start,
        t.pickup,
        t.pickupPoint,
        t.destination,
        t.arrival,
        t.leave,
        t.back,
        t.finish,
        t.seats,
        t.vehicleType,
        t.vehicleId,
        t.bookingType,
        t.bookingId,
        t.clientId,
        t.clientCompany,
      ]
        .map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CoachManager_Worksheet_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-[#d4d0c8] flex flex-col overflow-hidden text-[#111] select-none'
    : 'w-full bg-[#d4d0c8] border-2 border-[#808080] shadow-lg flex flex-col overflow-hidden text-[#111] select-none rounded-sm';

  return (
    <div
      className={containerClass}
      style={{
        fontFamily: 'Tahoma, "Segoe UI", Arial, sans-serif',
        fontSize: '11px',
        height: isFullscreen ? '100vh' : '860px',
      }}
    >
      {/* TOP TAB BAR: Grid | Reports + Preset Switchers */}
      <div className="flex items-center justify-between bg-[#e4e2dc] border-b border-[#808080] px-1.5 pt-1">
        <div className="flex items-end space-x-0.5">
          <button
            type="button"
            onClick={() => setActiveTopTab('grid')}
            className={`px-3 py-1 text-[11px] font-medium border-t border-l border-r rounded-t-sm ${
              activeTopTab === 'grid'
                ? 'bg-[#f0efe9] border-[#808080] text-black font-semibold -mb-[1px] pb-1.5 z-10'
                : 'bg-[#d4d0c8] border-[#999] text-[#333] hover:bg-[#dedad2]'
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setActiveTopTab('reports')}
            className={`px-3 py-1 text-[11px] font-medium border-t border-l border-r rounded-t-sm ${
              activeTopTab === 'reports'
                ? 'bg-[#f0efe9] border-[#808080] text-black font-semibold -mb-[1px] pb-1.5 z-10'
                : 'bg-[#d4d0c8] border-[#999] text-[#333] hover:bg-[#dedad2]'
            }`}
          >
            Reports
          </button>
        </div>

        {/* Right side quick helpers: Screenshot Date preset, Today button, Live Data source badge, Fullscreen */}
        <div className="flex items-center gap-1.5 pb-1">
          <span
            className={`px-1.5 py-0.5 text-[10px] rounded border ${
              worksheet?.source === 'redshift'
                ? 'bg-emerald-100 border-emerald-600 text-emerald-900 font-semibold'
                : 'bg-amber-100 border-amber-600 text-amber-900 font-semibold'
            }`}
            title={
              worksheet?.source === 'redshift'
                ? 'Connected to live Country Lion Redshift warehouse'
                : 'Showing exact 13/11/2024 Coach Manager reference snapshot'
            }
          >
            {worksheet?.source === 'redshift'
              ? `● Live Redshift (${worksheet?.displayDate || formatIsoToUk(selectedDate)})`
              : `● Reference Snapshot (${worksheet?.displayDate || formatIsoToUk(selectedDate)})`}
          </span>

          <button
            type="button"
            onClick={() => setSelectedDate(todayIso)}
            className={`px-2 py-0.5 text-[10px] border border-[#808080] shadow-inner ${
              selectedDate === todayIso
                ? 'bg-[#0078d7] text-white font-semibold'
                : 'bg-[#f0f0f0] text-black hover:bg-white'
            }`}
            title="Load today's live work sheet from Redshift"
          >
            Today ({formatIsoToUk(todayIso)})
          </button>

          <button
            type="button"
            onClick={() => setSelectedDate('2024-11-13')}
            className={`px-2 py-0.5 text-[10px] border border-[#808080] ${
              selectedDate === '2024-11-13'
                ? 'bg-[#0078d7] text-white font-semibold'
                : 'bg-[#f0f0f0] text-black hover:bg-white'
            }`}
            title="Load the exact 13/11/2024 screenshot dataset"
          >
            13/11/2024 (Screenshot View)
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            className="px-2 py-0.5 text-[10px] bg-[#f0f0f0] hover:bg-white border border-[#808080] text-black font-medium"
            title={isFullscreen ? 'Exit Fullscreen' : 'Expand Coach Manager Replica to Fullscreen'}
          >
            {isFullscreen ? '❐ Exit Fullscreen' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>

      {/* TOOLBAR ROW 1: Date Picker, Private Hires / Contracts checkboxes, Action Icons, All Bases selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f0efe9] border-b border-[#a0a0a0] px-2 py-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-[#222] font-medium">Date</span>
            <button
              type="button"
              onClick={() => setSelectedDate((d) => shiftIsoDays(d, -1))}
              className="w-5 h-5 flex items-center justify-center bg-[#e1dfd8] hover:bg-[#d0cec6] border border-[#808080] text-[10px] font-bold"
              title="Previous Day"
            >
              &lt;
            </button>
            <div className="relative flex items-center bg-white border border-[#7f9db9] px-1.5 h-5">
              <span className="text-[11px] font-semibold tracking-tight pr-1 pointer-events-none">
                {formatIsoToUk(selectedDate)}
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="w-4 h-4 opacity-80 cursor-pointer text-[10px]"
                title="Choose Date"
              />
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate((d) => shiftIsoDays(d, 1))}
              className="w-5 h-5 flex items-center justify-center bg-[#e1dfd8] hover:bg-[#d0cec6] border border-[#808080] text-[10px] font-bold"
              title="Next Day"
            >
              &gt;
            </button>
          </div>

          {/* Private Hires & Contracts checkboxes */}
          <label className="inline-flex items-center gap-1 cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={showPrivateHires}
              onChange={(e) => setShowPrivateHires(e.target.checked)}
              className="w-3.5 h-3.5 accent-[#0078d7]"
            />
            <span className="text-[11px] text-[#008080] font-semibold">Private Hires</span>
          </label>

          <label className="inline-flex items-center gap-1 cursor-pointer ml-1">
            <input
              type="checkbox"
              checked={showContracts}
              onChange={(e) => setShowContracts(e.target.checked)}
              className="w-3.5 h-3.5 accent-[#0078d7]"
            />
            <span className="text-[11px] text-[#000080] font-semibold">Contracts</span>
          </label>

          {/* Classic Coach Manager Toolbar Icon Buttons */}
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-[#b0b0b0]">
            <button
              type="button"
              onClick={() => expandOrCollapseAll(false)}
              className="px-1.5 h-5 flex items-center justify-center bg-[#e6e4dc] hover:bg-white border border-[#808080] text-[10px]"
              title="Expand all Driver Initial groups"
            >
              ⊞ Expand All
            </button>
            <button
              type="button"
              onClick={() => expandOrCollapseAll(true)}
              className="px-1.5 h-5 flex items-center justify-center bg-[#e6e4dc] hover:bg-white border border-[#808080] text-[10px]"
              title="Collapse all Driver Initial groups"
            >
              ⊟ Collapse All
            </button>
            <button
              type="button"
              onClick={handleClearFilters}
              className="w-6 h-5 flex items-center justify-center bg-[#e6e4dc] hover:bg-white border border-[#808080] text-[11px]"
              title="Clear all filters"
            >
              ✖
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="w-6 h-5 flex items-center justify-center bg-[#e6e4dc] hover:bg-white border border-[#808080] text-[11px]"
              title="Print Daily Work Sheet"
            >
              🖨
            </button>
            <button
              type="button"
              onClick={() => fetchWorksheet(selectedDate, true)}
              className="w-6 h-5 flex items-center justify-center bg-[#e6e4dc] hover:bg-white border border-[#808080] text-[11px] text-emerald-700 font-bold"
              title="Refresh from Redshift"
            >
              ↻
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-1.5 h-5 flex items-center justify-center bg-[#e6e4dc] hover:bg-white border border-[#808080] text-[10px] font-semibold text-sky-900"
              title="Export visible worksheet to CSV"
            >
              CSV
            </button>
          </div>
        </div>

        {/* Far-right All Bases dropdown matching screenshot */}
        <div className="flex items-center gap-1.5">
          <select
            value={baseFilter}
            onChange={(e) => setBaseFilter(e.target.value)}
            className="h-5 w-44 bg-white border border-[#7f9db9] px-1 text-[11px] text-black"
          >
            {(worksheet?.bases || ['All']).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TOOLBAR ROW 2: Base, Booking Type, Seats, Vehicle Type, Driver Type, Provisional, Search */}
      <div className="flex flex-wrap items-center gap-2 bg-[#f0efe9] border-b border-[#808080] px-2 py-1">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[#333]">Base</span>
          <select
            value={baseFilter}
            onChange={(e) => setBaseFilter(e.target.value)}
            className="h-5 w-28 bg-white border border-[#7f9db9] px-1 text-[11px]"
          >
            {(worksheet?.bases || ['All']).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[#333]">Booking Type</span>
          <select
            value={bookingTypeFilter}
            onChange={(e) => setBookingTypeFilter(e.target.value)}
            className="h-5 w-28 bg-white border border-[#7f9db9] px-1 text-[11px]"
          >
            {(worksheet?.bookingTypes || ['All']).map((bt) => (
              <option key={bt} value={bt}>
                {bt}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[#333]">Seats</span>
          <select
            value={seatsFilter}
            onChange={(e) => setSeatsFilter(e.target.value)}
            className="h-5 w-16 bg-white border border-[#7f9db9] px-1 text-[11px]"
          >
            {(worksheet?.seatOptions || ['All']).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[#333]">Vehicle Type</span>
          <select
            value={vehicleTypeFilter}
            onChange={(e) => setVehicleTypeFilter(e.target.value)}
            className="h-5 w-28 bg-white border border-[#7f9db9] px-1 text-[11px]"
          >
            {(worksheet?.vehicleTypes || ['All']).map((vt) => (
              <option key={vt} value={vt}>
                {vt}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[#333]">Driver Type</span>
          <select
            value={driverTypeFilter}
            onChange={(e) => setDriverTypeFilter(e.target.value)}
            className="h-5 w-24 bg-white border border-[#7f9db9] px-1 text-[11px]"
          >
            {(worksheet?.driverTypes || ['All', 'Driver', 'Office']).map((dt) => (
              <option key={dt} value={dt}>
                {dt}
              </option>
            ))}
          </select>
        </div>

        <label className="inline-flex items-center gap-1 cursor-pointer ml-1">
          <input
            type="checkbox"
            checked={showProvisionalOnly}
            onChange={(e) => setShowProvisionalOnly(e.target.checked)}
            className="w-3.5 h-3.5 accent-[#0078d7]"
          />
          <span className="text-[11px] text-[#333]">Provisional</span>
        </label>

        <div className="ml-auto flex items-center gap-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Quick search route, driver, vehicle..."
            className="h-5 w-48 bg-white border border-[#7f9db9] px-1.5 text-[11px]"
          />
        </div>
      </div>

      {/* GROUP BY BAR: Dark Grey Bar with [Driver ID ▲] */}
      <div className="flex items-center justify-between bg-[#6e6e6e] text-white px-2 py-1 border-b border-[#444]">
        <div className="flex items-center gap-2">
          <div className="bg-[#e4e2dc] text-black border border-[#333] px-2 py-0.5 text-[11px] font-medium flex items-center gap-1.5 shadow-sm">
            <span>Driver ID</span>
            <span className="text-[9px] text-[#444]">▲</span>
          </div>
          <span className="text-[10px] text-gray-200">
            Grouped by Driver Initial ({groupedByDriver.length} drivers active on{' '}
            {formatIsoToUk(selectedDate)}, {filteredTrips.length} trips)
          </span>
        </div>
        <div className="text-[10px] text-gray-200 hidden sm:block">
          Tip: Click a Vehicle (top-right) or Driver Initial (bottom-right) to inspect their allocated work below
        </div>
      </div>

      {activeTopTab === 'reports' ? (
        /* REPORTS TAB VIEW */
        <div className="flex-1 bg-white p-4 overflow-auto">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Coach Manager Daily Allocation Summary — {formatIsoToUk(selectedDate)}
                </h2>
                <p className="text-xs text-slate-600">
                  Total Trips: {filteredTrips.length} | Active Drivers: {groupedByDriver.length} | Fleet Vehicles Listed: {worksheet?.vehicles?.length || 0}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-3 py-1 bg-[#0078d7] text-white text-xs font-semibold rounded shadow-sm hover:bg-blue-700"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTopTab('grid')}
                  className="px-3 py-1 bg-slate-200 text-slate-800 text-xs font-semibold rounded hover:bg-slate-300"
                >
                  Back to Grid View
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="p-3 border rounded bg-slate-50">
                <div className="text-xs text-slate-500">Education / School Contracts (Navy)</div>
                <div className="text-xl font-bold text-[#000080]">
                  {filteredTrips.filter((t) => t.rowColor === 'navy').length} trips
                </div>
              </div>
              <div className="p-3 border rounded bg-slate-50">
                <div className="text-xs text-slate-500">Private Hires (Teal)</div>
                <div className="text-xl font-bold text-[#008080]">
                  {filteredTrips.filter((t) => t.rowColor === 'teal').length} trips
                </div>
              </div>
              <div className="p-3 border rounded bg-slate-50">
                <div className="text-xs text-slate-500">Corporate & Shuttle Contracts (Brown)</div>
                <div className="text-xl font-bold text-[#804000]">
                  {filteredTrips.filter((t) => t.rowColor === 'brown').length} trips
                </div>
              </div>
            </div>

            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border border-slate-300 px-2 py-1 text-left">Driver ID</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">Driver Name</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">Allocated Trips</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">First Start</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">Last Finish</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">Vehicles Used</th>
                </tr>
              </thead>
              <tbody>
                {groupedByDriver.map((g) => {
                  const vehiclesUsed = [...new Set(g.trips.map((t) => t.vehicleId))].join(', ');
                  return (
                    <tr key={g.driverId} className="hover:bg-slate-50">
                      <td className="border border-slate-300 px-2 py-1 font-bold">{g.driverId}</td>
                      <td className="border border-slate-300 px-2 py-1">{g.driverName}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-semibold">
                        {g.trips.length}
                      </td>
                      <td className="border border-slate-300 px-2 py-1">{g.trips[0]?.start}</td>
                      <td className="border border-slate-300 px-2 py-1">
                        {g.trips[g.trips.length - 1]?.finish}
                      </td>
                      <td className="border border-slate-300 px-2 py-1">{vehiclesUsed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* MAIN WORKSHEET SPLIT LAYOUT */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* TOP & MIDDLE AREA (Left: Main Grid + Middle Inspector | Right: Vehicle & Driver Docked Lists) */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* LEFT/CENTER COLUMN: Main Grouped Worksheet Grid + Record Nav + Middle Inspector */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0 border-r border-[#808080]">
              {/* MAIN GROUPED GRID */}
              <div className="flex-1 bg-white overflow-auto relative">
                {loading ? (
                  <div className="flex items-center justify-center h-full text-xs text-gray-600">
                    Loading Coach Manager worksheet for {formatIsoToUk(selectedDate)}...
                  </div>
                ) : error ? (
                  <div className="p-4 text-xs text-red-700 bg-red-50 border border-red-300 m-2">
                    {error}
                  </div>
                ) : (
                  <table className="w-full border-collapse table-fixed text-[11px]">
                    <thead className="sticky top-0 z-20 bg-[#e4e2dc] text-black border-b border-[#808080] shadow-xs">
                      <tr className="h-5">
                        <th className="w-4 border-r border-[#a0a0a0] px-0.5 text-center" />
                        <th className="w-7 border-r border-[#a0a0a0] px-0.5 text-center" title="Status">
                          ✓
                        </th>
                        <th className="w-10 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Track
                        </th>
                        <th className="w-11 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Start
                        </th>
                        <th className="w-12 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Pick-up
                        </th>
                        <th className="w-36 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Pickup Point
                        </th>
                        <th className="w-40 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Destination
                        </th>
                        <th className="w-11 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Arrival
                        </th>
                        <th className="w-11 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Leave
                        </th>
                        <th className="w-10 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Back
                        </th>
                        <th className="w-11 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Finish
                        </th>
                        <th className="w-10 border-r border-[#a0a0a0] px-1 text-right font-normal">
                          Seats
                        </th>
                        <th className="w-20 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Vehicle Type
                        </th>
                        <th className="w-20 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Vehicle ID
                        </th>
                        <th className="w-16 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Driver Type
                        </th>
                        <th className="w-14 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Driver ID
                        </th>
                        <th className="w-28 border-r border-[#a0a0a0] px-1 text-left font-normal">
                          Driver Name
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedByDriver.length === 0 ? (
                        <tr>
                          <td colSpan={17} className="p-6 text-center text-gray-500">
                            No work found matching current filters on {formatIsoToUk(selectedDate)}.
                          </td>
                        </tr>
                      ) : (
                        groupedByDriver.map((group) => {
                          const isCollapsed = Boolean(collapsedGroups[group.driverId]);
                          const isDriverSelected =
                            bottomMode === 'driver' && selectedDriverId === group.driverId;

                          return (
                            <React.Fragment key={group.driverId}>
                              {/* DRIVER INITIAL GROUP HEADER ROW */}
                              <tr
                                onClick={() => {
                                  setSelectedDriverId(group.driverId);
                                  setBottomMode('driver');
                                  if (group.trips[0]) setSelectedTripId(group.trips[0].id);
                                }}
                                className={`h-5 border-b border-[#b5b5b5] cursor-pointer ${
                                  isDriverSelected ? 'bg-[#d9e8fb]' : 'bg-[#efefef] hover:bg-[#e5ecf6]'
                                }`}
                              >
                                <td
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleDriverGroup(group.driverId);
                                  }}
                                  className="border-r border-[#c0c0c0] text-center font-mono text-[10px] cursor-pointer"
                                  title={isCollapsed ? 'Expand driver group' : 'Collapse driver group'}
                                >
                                  <span className="inline-block w-3 h-3 leading-[10px] border border-[#666] bg-white text-black font-bold">
                                    {isCollapsed ? '+' : '-'}
                                  </span>
                                </td>
                                <td colSpan={16} className="px-1.5 font-bold text-[#111] tracking-tight">
                                  <span>{group.driverId}</span>
                                  <span className="ml-2 font-normal text-[#555] text-[10px]">
                                    ({group.driverName} — {group.trips.length}{' '}
                                    {group.trips.length === 1 ? 'job' : 'jobs'})
                                  </span>
                                </td>
                              </tr>

                              {/* ALLOCATED WORK ROWS FOR THIS DRIVER INITIAL */}
                              {!isCollapsed &&
                                group.trips.map((trip) => {
                                  const isSelected = selectedTrip?.id === trip.id;
                                  const isVehicleHighlighted =
                                    bottomMode === 'vehicle' &&
                                    trip.vehicleId === selectedVehicleId;
                                  const textColor =
                                    ROW_TEXT_COLORS[trip.rowColor] || ROW_TEXT_COLORS.navy;

                                  return (
                                    <tr
                                      key={trip.id}
                                      onClick={() => handleSelectTripRow(trip)}
                                      style={{
                                        color: isSelected ? '#ffffff' : textColor,
                                      }}
                                      className={`h-[19px] border-b border-[#dcdcdc] cursor-pointer whitespace-nowrap ${
                                        isSelected
                                          ? 'bg-[#0078d7] font-semibold'
                                          : isVehicleHighlighted
                                          ? 'bg-[#fff8dc] hover:bg-[#cde6f7]'
                                          : 'bg-white hover:bg-[#e8f2fe]'
                                      }`}
                                    >
                                      {/* Row selector gutter */}
                                      <td className="bg-[#e4e2dc] text-black border-r border-[#a0a0a0] text-center text-[9px] font-bold">
                                        {isSelected ? '▶' : ''}
                                      </td>
                                      {/* Status icon */}
                                      <td className="border-r border-[#dcdcdc] px-0.5 text-center bg-white">
                                        <StatusCellIcon
                                          status={trip.status}
                                          hasMagnifier={trip.hasMagnifier}
                                        />
                                      </td>
                                      <td className="border-r border-[#dcdcdc] px-1 truncate">
                                        {trip.track}
                                      </td>
                                      <td className="border-r border-[#dcdcdc] px-1">{trip.start}</td>
                                      <td className="border-r border-[#dcdcdc] px-1">{trip.pickup}</td>
                                      <td
                                        className="border-r border-[#dcdcdc] px-1 truncate"
                                        title={trip.pickupPoint}
                                      >
                                        {trip.pickupPoint}
                                      </td>
                                      <td
                                        className="border-r border-[#dcdcdc] px-1 truncate"
                                        title={trip.destination}
                                      >
                                        {trip.destination}
                                      </td>
                                      <td className="border-r border-[#dcdcdc] px-1">{trip.arrival}</td>
                                      <td className="border-r border-[#dcdcdc] px-1">{trip.leave}</td>
                                      <td className="border-r border-[#dcdcdc] px-1">{trip.back}</td>
                                      <td className="border-r border-[#dcdcdc] px-1">{trip.finish}</td>
                                      <td className="border-r border-[#dcdcdc] px-1 text-right">
                                        {trip.seats}
                                      </td>
                                      <td className="border-r border-[#dcdcdc] px-1 truncate">
                                        {trip.vehicleType}
                                      </td>
                                      <td
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (trip.vehicleId && trip.vehicleId !== 'UNALLOC') {
                                            handleClickVehicleRightTop({
                                              vehicleId: trip.vehicleId,
                                            });
                                          }
                                        }}
                                        className="border-r border-[#dcdcdc] px-1 truncate underline decoration-dotted"
                                        title="Click to inspect all allocated work for this Vehicle in bottom panel"
                                      >
                                        {trip.vehicleId}
                                      </td>
                                      <td className="border-r border-[#dcdcdc] px-1 truncate">
                                        {trip.driverType}
                                      </td>
                                      <td className="border-r border-[#dcdcdc] px-1 font-semibold">
                                        {trip.driverId}
                                      </td>
                                      <td
                                        className="border-r border-[#dcdcdc] px-1 truncate"
                                        title={trip.driverName}
                                      >
                                        {trip.driverName}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* RECORD NAVIGATION BAR: Record: |◄ ◄ [ 3 ] of 161 ► ►| */}
              <div className="h-5 bg-[#e4e2dc] border-t border-b border-[#808080] px-2 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1">
                  <span className="text-[#333]">Record:</span>
                  <button
                    type="button"
                    onClick={() => navigateRecord(1)}
                    className="px-1 leading-none bg-[#d4d0c8] hover:bg-white border border-[#808080] text-[10px]"
                    title="First Record"
                  >
                    |◄
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateRecord(selectedTripIndex - 1)}
                    className="px-1 leading-none bg-[#d4d0c8] hover:bg-white border border-[#808080] text-[10px]"
                    title="Previous Record"
                  >
                    ◄
                  </button>
                  <input
                    type="text"
                    readOnly
                    value={filteredTrips.length ? selectedTripIndex : 0}
                    className="w-10 h-4 bg-white border border-[#7f9db9] text-center text-[10px] font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => navigateRecord(selectedTripIndex + 1)}
                    className="px-1 leading-none bg-[#d4d0c8] hover:bg-white border border-[#808080] text-[10px]"
                    title="Next Record"
                  >
                    ►
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateRecord(filteredTrips.length)}
                    className="px-1 leading-none bg-[#d4d0c8] hover:bg-white border border-[#808080] text-[10px]"
                    title="Last Record"
                  >
                    ►|
                  </button>
                  <span className="text-[#333] ml-1">
                    of {worksheet?.totalRecords || filteredTrips.length}
                  </span>
                </div>

                {/* Color legend matching Coach Manager */}
                <div className="hidden md:flex items-center gap-3 text-[10px]">
                  <span className="inline-flex items-center gap-1 text-[#000080] font-semibold">
                    <span className="w-2 h-2 bg-[#000080] inline-block" /> Con Edu (School)
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#008080] font-semibold">
                    <span className="w-2 h-2 bg-[#008080] inline-block" /> Pri Hire (Private Hire)
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#804000] font-semibold">
                    <span className="w-2 h-2 bg-[#804000] inline-block" /> Con Bar / Corp
                  </span>
                </div>
              </div>

              {/* MIDDLE INSPECTOR STRIP: Booking ID / Client Info + Pick-up Instructions + Destination Instructions */}
              <div className="h-28 bg-[#f0efe9] border-b border-[#808080] p-1.5 grid grid-cols-12 gap-2">
                {/* Left Box: Booking ID, Client ID, Name, Company, A/C Balance */}
                <div className="col-span-4 flex flex-col justify-between pr-1">
                  <div className="grid grid-cols-12 items-center gap-1">
                    <span className="col-span-4 text-[11px] text-[#333]">Booking ID</span>
                    <input
                      type="text"
                      readOnly
                      value={selectedTrip?.bookingId || ''}
                      className="col-span-8 h-5 bg-white border border-[#7f9db9] px-1.5 text-[11px] font-semibold text-black"
                    />
                  </div>
                  <div className="grid grid-cols-12 items-center gap-1">
                    <span className="col-span-4 text-[11px] text-[#333]">Client ID</span>
                    <span className="col-span-8 text-[11px] font-semibold text-black truncate">
                      {selectedTrip?.clientId || ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-12 items-center gap-1">
                    <span className="col-span-4 text-[11px] text-[#333]">Name</span>
                    <span className="col-span-8 text-[11px] text-black truncate">
                      {selectedTrip?.clientContact || ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-12 items-center gap-1">
                    <span className="col-span-4 text-[11px] text-[#333]">Company</span>
                    <span
                      className="col-span-8 text-[11px] font-semibold text-black truncate"
                      title={selectedTrip?.clientCompany || ''}
                    >
                      {selectedTrip?.clientCompany || ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-12 items-center gap-1">
                    <span className="col-span-4 text-[11px] text-[#333]">A/C Balance</span>
                    <span className="col-span-8 text-[11px] font-semibold text-black">
                      {selectedTrip?.accountBalance || '£0.00'}
                    </span>
                  </div>
                </div>

                {/* Middle Box: Pick-up Instructions */}
                <div className="col-span-4 flex flex-col min-h-0">
                  <span className="text-[11px] text-[#222] mb-0.5">Pick-up Instructions:</span>
                  <textarea
                    readOnly
                    value={selectedTrip?.pickupInstructions || ''}
                    className="flex-1 w-full bg-white border border-[#7f9db9] p-1 text-[11px] leading-tight resize-none font-sans text-black"
                  />
                </div>

                {/* Right Box: Destination Instructions */}
                <div className="col-span-4 flex flex-col min-h-0">
                  <span className="text-[11px] text-[#222] mb-0.5">Destination Instructions:</span>
                  <textarea
                    readOnly
                    value={selectedTrip?.destinationInstructions || ''}
                    className="flex-1 w-full bg-white border border-[#7f9db9] p-1 text-[11px] leading-tight resize-none font-sans text-black"
                  />
                </div>
              </div>
            </div>

            {/* RIGHT-HAND DOCKED SIDEBAR (Top-Right: Vehicle ID | Bottom-Right: Driver ID) */}
            <div className="w-44 sm:w-48 flex flex-col min-h-0 bg-[#f0efe9]">
              {/* TOP-RIGHT PANEL: Vehicle ID list */}
              <div className="flex-1 flex flex-col min-h-0 border-b border-[#808080]">
                <div className="flex-1 bg-white overflow-y-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead className="sticky top-0 z-10 bg-[#e4e2dc] border-b border-[#808080]">
                      <tr className="h-5">
                        <th className="w-4 border-r border-[#a0a0a0]" />
                        <th className="border-r border-[#a0a0a0] px-1.5 text-left font-normal">
                          <div className="flex items-center justify-between">
                            <span>Vehicle ID</span>
                            <span className="text-[9px] text-[#555]">▲</span>
                          </div>
                        </th>
                        <th className="w-6 border-r border-[#a0a0a0] text-center font-normal" title="Workshop / VOR flag">
                          🛠
                        </th>
                        <th className="w-6 text-center font-normal" title="Allocation Status" />
                      </tr>
                    </thead>
                    <tbody>
                      {(worksheet?.vehicles || []).map((veh) => {
                        const isSelected =
                          selectedVehicleId === veh.vehicleId && bottomMode === 'vehicle';
                        const isCurrentTripVeh = selectedTrip?.vehicleId === veh.vehicleId;

                        return (
                          <tr
                            key={veh.vehicleId}
                            onClick={() => handleClickVehicleRightTop(veh)}
                            title={`Click to view allocated work for vehicle ${veh.vehicleId} (${veh.tripCount || 0} jobs)`}
                            className={`h-[18px] border-b border-[#dcdcdc] cursor-pointer ${
                              isSelected
                                ? 'bg-[#0078d7] text-white font-bold'
                                : isCurrentTripVeh
                                ? 'bg-[#d9e8fb] text-black font-semibold'
                                : 'bg-white hover:bg-[#e8f2fe] text-black'
                            }`}
                          >
                            <td className="bg-[#e4e2dc] text-black border-r border-[#a0a0a0] text-center text-[9px] font-bold">
                              {isSelected || isCurrentTripVeh ? '▶' : ''}
                            </td>
                            <td className="border-r border-[#dcdcdc] px-1.5 truncate">
                              {veh.vehicleId}
                            </td>
                            <td className="border-r border-[#dcdcdc] text-center bg-white">
                              {veh.hasWorkshopFlag ? (
                                <span title="Workshop / Maintenance note" className="text-[10px]">
                                  🛠
                                </span>
                              ) : null}
                            </td>
                            <td
                              className="border-l border-[#dcdcdc]"
                              style={{
                                backgroundColor:
                                  veh.statusColor === 'yellow'
                                    ? '#ffff00'
                                    : veh.statusColor === 'purple'
                                    ? '#993366'
                                    : '#ffffff',
                              }}
                            />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="h-5 bg-[#e4e2dc] border-t border-[#808080] px-1.5 flex items-center justify-between text-[11px] text-[#222]">
                  <span>Records: {worksheet?.vehicles?.length || 0}</span>
                  <span className="text-[9px] text-[#555]">Click for Vehicle Work</span>
                </div>
              </div>

              {/* BOTTOM-RIGHT PANEL: Driver ID list */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 bg-white overflow-y-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead className="sticky top-0 z-10 bg-[#e4e2dc] border-b border-[#808080]">
                      <tr className="h-5">
                        <th className="w-4 border-r border-[#a0a0a0]" />
                        <th className="border-r border-[#a0a0a0] px-1.5 text-left font-normal">
                          <div className="flex items-center justify-between">
                            <span>Driver ID</span>
                            <span className="text-[9px] text-[#555]">▲</span>
                          </div>
                        </th>
                        <th className="w-6 border-r border-[#a0a0a0] text-center font-normal" title="Driver Alert / Note">
                          !
                        </th>
                        <th className="w-6 text-center font-normal" title="Allocated Status" />
                      </tr>
                    </thead>
                    <tbody>
                      {(worksheet?.drivers || []).map((drv) => {
                        const isSelected =
                          selectedDriverId === drv.driverId && bottomMode === 'driver';
                        const isCurrentTripDrv = selectedTrip?.driverId === drv.driverId;

                        return (
                          <tr
                            key={drv.driverId}
                            onClick={() => handleClickDriverRightBottom(drv)}
                            title={`${drv.driverId} — ${drv.driverName} (${drv.tripCount || 0} allocated jobs). Click to view driver work below.`}
                            className={`h-[18px] border-b border-[#dcdcdc] cursor-pointer ${
                              isSelected
                                ? 'bg-[#0078d7] text-white font-bold'
                                : isCurrentTripDrv
                                ? 'bg-[#d9e8fb] text-black font-semibold'
                                : 'bg-white hover:bg-[#e8f2fe] text-black'
                            }`}
                          >
                            <td className="bg-[#e4e2dc] text-black border-r border-[#a0a0a0] text-center text-[9px] font-bold">
                              {isSelected || isCurrentTripDrv ? '▶' : ''}
                            </td>
                            <td className="border-r border-[#dcdcdc] px-1.5 font-medium truncate">
                              {drv.driverId}
                            </td>
                            <td className="border-r border-[#dcdcdc] text-center bg-white">
                              {drv.hasWarning ? (
                                <span
                                  title="Driver compliance / schedule note"
                                  className="inline-block w-3 h-3 rounded-full bg-red-600 text-white text-[9px] font-bold leading-3"
                                >
                                  !
                                </span>
                              ) : null}
                            </td>
                            <td
                              className="border-l border-[#dcdcdc]"
                              style={{
                                backgroundColor:
                                  drv.statusColor === 'orange' || drv.tripCount > 0
                                    ? '#ff9900'
                                    : '#ffffff',
                              }}
                            />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="h-5 bg-[#e4e2dc] border-t border-[#808080] px-1.5 flex items-center justify-between text-[11px] text-[#222]">
                  <span>Records: {worksheet?.drivers?.length || 0}</span>
                  <span className="text-[9px] text-[#555]">Click for Driver Work</span>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM ALLOCATED WORK PANEL (Updates when clicking a Vehicle on Top-Right OR a Driver Initial on Bottom-Right) */}
          <div className="h-48 flex flex-col bg-[#f0efe9] border-t border-[#808080]">
            {/* Bottom Panel Header Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 bg-[#e4e2dc] border-b border-[#808080]">
              <div className="flex flex-wrap items-center gap-2">
                {/* Date indicator */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-[#333]">Date</span>
                  <button
                    type="button"
                    onClick={() => setSelectedDate((d) => shiftIsoDays(d, -1))}
                    className="w-4 h-4 flex items-center justify-center bg-[#d4d0c8] border border-[#808080] text-[9px]"
                  >
                    &lt;
                  </button>
                  <input
                    type="text"
                    readOnly
                    value={formatIsoToUk(selectedDate)}
                    className="w-20 h-5 bg-white border border-[#7f9db9] px-1.5 text-[11px] font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedDate((d) => shiftIsoDays(d, 1))}
                    className="w-4 h-4 flex items-center justify-center bg-[#d4d0c8] border border-[#808080] text-[9px]"
                  >
                    &gt;
                  </button>
                </div>

                {bottomMode === 'driver' ? (
                  /* DRIVER ALLOCATED WORK HEADER FIELDS (Matches Screenshot) */
                  <>
                    <div className="flex items-center gap-1 ml-2">
                      <span className="text-[11px] text-[#333]">Driver ID</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedDriverMeta.driverId}
                        className="w-16 h-5 bg-white border border-[#7f9db9] px-1.5 text-[11px] font-bold text-black"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-[#333]">Driver Type</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedDriverMeta.driverType || 'Driver'}
                        className="w-20 h-5 bg-white border border-[#7f9db9] px-1.5 text-[11px]"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-[#333]">Driver Name</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedDriverMeta.driverName}
                        className="w-36 h-5 bg-white border border-[#7f9db9] px-1.5 text-[11px] font-semibold"
                      />
                    </div>
                    <label className="inline-flex items-center gap-1 ml-2">
                      <span className="text-[11px] text-[#333]">Part Time</span>
                      <input
                        type="checkbox"
                        readOnly
                        checked={Boolean(selectedDriverMeta.partTime)}
                        className="w-3.5 h-3.5"
                      />
                    </label>
                    <label className="inline-flex items-center gap-1 ml-1">
                      <span className="text-[11px] text-[#333]">Secondary</span>
                      <input
                        type="checkbox"
                        readOnly
                        checked={Boolean(selectedDriverMeta.secondary)}
                        className="w-3.5 h-3.5"
                      />
                    </label>
                  </>
                ) : (
                  /* VEHICLE ALLOCATED WORK HEADER FIELDS (When a Vehicle is clicked on Top-Right) */
                  <>
                    <div className="flex items-center gap-1 ml-2">
                      <span className="text-[11px] font-semibold text-[#000080]">Vehicle ID</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedVehicleMeta.vehicleId}
                        className="w-24 h-5 bg-[#fff8dc] border border-[#0078d7] px-1.5 text-[11px] font-bold text-black"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-[#333]">Vehicle Type</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedVehicleMeta.vehicleType || 'Coach'}
                        className="w-24 h-5 bg-white border border-[#7f9db9] px-1.5 text-[11px]"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-[#333]">Reg</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedVehicleMeta.licensePlate || '—'}
                        className="w-20 h-5 bg-white border border-[#7f9db9] px-1.5 text-[11px] font-semibold"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-[#333]">Seats</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedVehicleMeta.seats || 53}
                        className="w-12 h-5 bg-white border border-[#7f9db9] px-1.5 text-[11px] text-right"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-[#333]">Driver Name</span>
                      <input
                        type="text"
                        readOnly
                        value={selectedTrip?.driverName || selectedDriverMeta.driverName}
                        className="w-32 h-5 bg-white border border-[#7f9db9] px-1.5 text-[11px]"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Mode indicator pill */}
              <div className="flex items-center gap-1.5">
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${
                    bottomMode === 'vehicle'
                      ? 'bg-amber-100 border-amber-600 text-amber-950'
                      : 'bg-sky-100 border-sky-600 text-sky-950'
                  }`}
                >
                  {bottomMode === 'vehicle'
                    ? `Vehicle Allocated Work: ${selectedVehicleMeta.vehicleId}`
                    : `Driver Allocated Work: ${selectedDriverMeta.driverId} (${selectedDriverMeta.driverName})`}
                </span>
              </div>
            </div>

            {/* Bottom Allocated Work Table */}
            <div className="flex-1 bg-white overflow-auto">
              <table className="w-full border-collapse table-fixed text-[11px]">
                <thead className="sticky top-0 z-10 bg-[#e4e2dc] text-black border-b border-[#808080]">
                  <tr className="h-5">
                    <th className="w-4 border-r border-[#a0a0a0]" />
                    <th className="w-12 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Start
                    </th>
                    <th className="w-12 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Pick-up
                    </th>
                    <th className="w-44 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Pickup Point
                    </th>
                    <th className="w-12 border-r border-[#a0a0a0] px-1 text-center font-normal">
                      Single
                    </th>
                    <th className="w-10 border-r border-[#a0a0a0] px-1 text-center font-normal">
                      Stay
                    </th>
                    <th className="w-44 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Destination
                    </th>
                    <th className="w-12 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Arrival
                    </th>
                    <th className="w-12 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Leave
                    </th>
                    <th className="w-12 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Back
                    </th>
                    <th className="w-12 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Finish
                    </th>
                    <th className="w-24 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Vehicle ID
                    </th>
                    {bottomMode === 'vehicle' && (
                      <th className="w-28 border-r border-[#a0a0a0] px-1 text-left font-normal">
                        Driver
                      </th>
                    )}
                    <th className="w-20 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Booking Type
                    </th>
                    <th className="w-20 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Client ID
                    </th>
                    <th className="w-28 border-r border-[#a0a0a0] px-1 text-left font-normal">
                      Booking ID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bottomAllocatedTrips.length === 0 ? (
                    <tr>
                      <td
                        colSpan={bottomMode === 'vehicle' ? 16 : 15}
                        className="p-4 text-center text-gray-500"
                      >
                        {bottomMode === 'vehicle'
                          ? `No allocated trips for Vehicle ${selectedVehicleId} on ${formatIsoToUk(selectedDate)}.`
                          : `No allocated trips for Driver ${selectedDriverId} on ${formatIsoToUk(selectedDate)}.`}
                      </td>
                    </tr>
                  ) : (
                    bottomAllocatedTrips.map((trip) => {
                      const isSelected = selectedTrip?.id === trip.id;
                      const textColor =
                        ROW_TEXT_COLORS[trip.rowColor] || ROW_TEXT_COLORS.navy;

                      return (
                        <tr
                          key={`bottom-${trip.id}`}
                          onClick={() => setSelectedTripId(trip.id)}
                          style={{
                            color: isSelected ? '#ffffff' : textColor,
                          }}
                          className={`h-[19px] border-b border-[#dcdcdc] cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? 'bg-[#0078d7] font-semibold'
                              : 'bg-white hover:bg-[#e8f2fe]'
                          }`}
                        >
                          <td className="bg-[#e4e2dc] text-black border-r border-[#a0a0a0] text-center text-[9px] font-bold">
                            {isSelected ? '▶' : ''}
                          </td>
                          <td className="border-r border-[#dcdcdc] px-1">{trip.start}</td>
                          <td className="border-r border-[#dcdcdc] px-1">{trip.pickup}</td>
                          <td
                            className="border-r border-[#dcdcdc] px-1 truncate"
                            title={trip.pickupPoint}
                          >
                            {trip.pickupPoint}
                          </td>
                          <td className="border-r border-[#dcdcdc] px-1 text-center">
                            <input
                              type="checkbox"
                              readOnly
                              checked={Boolean(trip.single)}
                              className="w-3 h-3 pointer-events-none"
                            />
                          </td>
                          <td className="border-r border-[#dcdcdc] px-1 text-center">
                            <input
                              type="checkbox"
                              readOnly
                              checked={Boolean(trip.stay)}
                              className="w-3 h-3 pointer-events-none"
                            />
                          </td>
                          <td
                            className="border-r border-[#dcdcdc] px-1 truncate"
                            title={trip.destination}
                          >
                            {trip.destination}
                          </td>
                          <td className="border-r border-[#dcdcdc] px-1">{trip.arrival}</td>
                          <td className="border-r border-[#dcdcdc] px-1">{trip.leave}</td>
                          <td className="border-r border-[#dcdcdc] px-1">{trip.back}</td>
                          <td className="border-r border-[#dcdcdc] px-1">{trip.finish}</td>
                          <td className="border-r border-[#dcdcdc] px-1 font-medium">
                            {trip.vehicleId}
                          </td>
                          {bottomMode === 'vehicle' && (
                            <td className="border-r border-[#dcdcdc] px-1 truncate">
                              {trip.driverId} ({trip.driverName})
                            </td>
                          )}
                          <td className="border-r border-[#dcdcdc] px-1">{trip.bookingType}</td>
                          <td className="border-r border-[#dcdcdc] px-1">{trip.clientId}</td>
                          <td className="border-r border-[#dcdcdc] px-1">{trip.bookingId}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Status Footer: Records: 4 | Log Entry: Lunch | Comment: Office */}
            <div className="h-5 bg-[#e4e2dc] border-t border-[#808080] px-2 flex items-center gap-8 text-[11px] text-[#222]">
              <span>Records: {bottomAllocatedTrips.length}</span>
              <span>Log Entry: {selectedDriverMeta.logEntry || 'Lunch'}</span>
              <span>Comment: {selectedDriverMeta.comment || 'Office'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
