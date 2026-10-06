import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import WorkspaceTabs from '../components/WorkspaceTabs';
import { readJsonResponse } from '../utils/employeeProfile';

const inputClass = 'w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2';
const textareaClass = `${inputClass} min-h-[7rem] resize-y`;
const EMERGENCY_OPTIONS = ['Police', 'Fire', 'Ambulance'];

function toDatetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

const EMPTY_FORM = {
  incidentAt: toDatetimeLocalValue(new Date().toISOString()),
  location: '',
  vehicleReg: '',
  vehicleId: '',
  roadDescription: '',
  weather: '',
  visibility: '',
  emergencyServices: false,
  emergencyServicesTypes: [],
  injuries: false,
  injuriesDetails: '',
  hospital: false,
  hospitalDetails: '',
  clVehicleDamage: false,
  clVehicleDamageDetails: '',
  thirdPartyVehicle: false,
  thirdPartyReg: '',
  thirdPartyMake: '',
  thirdPartyModel: '',
  thirdPartyDriver: '',
  thirdPartyDamage: '',
  propertyDamage: false,
  propertyDamageDetails: '',
  comments: '',
};

function YesNoField({
  name,
  label,
  detailsName,
  detailsLabel,
  checked,
  detailsValue,
  onChange,
}) {
  return (
    <div className="space-y-2 rounded-lg border border-[#1a2540] bg-[#060e1a]/40 p-3">
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" name={name} checked={Boolean(checked)} onChange={onChange} />
        {label}
      </label>
      {checked && detailsName ? (
        <label className="block space-y-1">
          <span className="text-xs uppercase text-slate-500">{detailsLabel || 'Details'}</span>
          <textarea
            name={detailsName}
            value={detailsValue || ''}
            onChange={onChange}
            rows={5}
            className={textareaClass}
            placeholder="Add as much detail as needed"
          />
        </label>
      ) : null}
    </div>
  );
}

export default function BumpCardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const caseIdParam = searchParams.get('caseId') || '';
  const promptIdParam = searchParams.get('promptId') || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [driverName, setDriverName] = useState('');
  const [caseId, setCaseId] = useState(caseIdParam);
  const [promptId, setPromptId] = useState(promptIdParam);
  const [vehiclesAccidentId, setVehiclesAccidentId] = useState('');
  const [imageUrls, setImageUrls] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (caseIdParam) params.set('caseId', caseIdParam);
        if (promptIdParam) params.set('promptId', promptIdParam);
        const response = await fetch(`/api/getBumpCardContext?${params.toString()}`, {
          credentials: 'include',
        });
        const data = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(data.error || 'Failed to load bump card.');
        if (cancelled) return;
        setDriverName(data.driverName || data.case?.employeeNameSnapshot || '');
        if (data.prompt?.id) setPromptId(data.prompt.id);
        if (data.case?.id) setCaseId(data.case.id);
        setVehiclesAccidentId(
          data.case?.vehiclesAccidentId || data.prompt?.vehiclesAccidentId || '',
        );
        setForm((prev) => ({
          ...prev,
          incidentAt: toDatetimeLocalValue(
            data.case?.incidentAt || data.prompt?.incidentAt || prev.incidentAt,
          ),
          vehicleReg: data.case?.vehicleReg || data.prompt?.vehicleReg || prev.vehicleReg,
          vehicleId: data.case?.vehicleId || data.prompt?.vehicleId || prev.vehicleId,
        }));
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load bump card.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [caseIdParam, promptIdParam]);

  const canSubmit = useMemo(() => {
    return Boolean(
      String(form.roadDescription || '').trim()
      && String(form.location || '').trim()
      && String(form.vehicleReg || '').trim()
      && form.incidentAt,
    );
  }, [form]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const toggleEmergencyType = (option) => {
    setForm((prev) => {
      const current = new Set(prev.emergencyServicesTypes || []);
      if (current.has(option)) current.delete(option);
      else current.add(option);
      const next = Array.from(current);
      return {
        ...prev,
        emergencyServicesTypes: next,
        emergencyServices: next.length > 0 ? true : prev.emergencyServices,
      };
    });
  };

  const uploadImages = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (!caseId) {
      setError('Images can be uploaded after this bump card is linked to an accident case. Record the accident first, or submit without images.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of files) {
        const contentBase64 = await readFileAsBase64(file);
        const response = await fetch('/api/uploadDisciplinaryDocument', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId,
            fileName: file.name,
            contentBase64,
            mimeType: file.type || 'application/octet-stream',
            documentType: 'evidence',
            stageKey: 'recorded',
            source: 'bump_card_image',
          }),
        });
        const data = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(data.error || `Failed to upload ${file.name}.`);
        if (data.sharePointWebUrl) uploaded.push(data.sharePointWebUrl);
      }
      setImageUrls((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err.message || 'Failed to upload images.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) {
      setError('Complete when, location, registration, and what happened on the road.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/submitBumpCard', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          caseId: caseId || undefined,
          promptId: promptId || undefined,
          vehiclesAccidentId: vehiclesAccidentId || undefined,
          incidentAt: form.incidentAt ? new Date(form.incidentAt).toISOString() : new Date().toISOString(),
          vehicleReg: String(form.vehicleReg || '').trim().toUpperCase(),
          imageUrls,
          description: form.roadDescription,
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to submit bump card.');
      navigate('/dashboard/profile', { state: { profileTab: 'cases', message: data.message || 'Bump card submitted.' } });
    } catch (err) {
      setError(err.message || 'Failed to submit bump card.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <WorkspaceTabs />
      <div className="px-8 py-6 border-b border-[#1a2540]">
        <h1 className="text-2xl font-bold text-white">Vehicle bump card</h1>
        <p className="text-sm text-slate-400 mt-1">
          Report what happened. Prefills come from the recorded accident where available.
        </p>
        {driverName ? <p className="text-sm text-slate-300 mt-2">Driver: {driverName}</p> : null}
      </div>
      <div className="p-8 max-w-3xl space-y-4 overflow-auto">
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {error && <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3 text-sm text-red-300">{error}</div>}

        {!loading && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block space-y-1">
                <span className="text-xs uppercase text-slate-500">When</span>
                <input type="datetime-local" name="incidentAt" value={form.incidentAt} onChange={handleChange} className={inputClass} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase text-slate-500">Vehicle registration</span>
                <input name="vehicleReg" value={form.vehicleReg} onChange={handleChange} className={`${inputClass} uppercase`} />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs uppercase text-slate-500">Location</span>
              <textarea name="location" value={form.location} onChange={handleChange} rows={3} className={textareaClass} />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase text-slate-500">Description on the road</span>
              <textarea name="roadDescription" value={form.roadDescription} onChange={handleChange} rows={6} className={textareaClass} />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block space-y-1">
                <span className="text-xs uppercase text-slate-500">Weather</span>
                <input name="weather" value={form.weather} onChange={handleChange} className={inputClass} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase text-slate-500">Visibility</span>
                <input name="visibility" value={form.visibility} onChange={handleChange} className={inputClass} />
              </label>
            </div>

            <div className="space-y-2 rounded-lg border border-[#1a2540] bg-[#060e1a]/40 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  name="emergencyServices"
                  checked={form.emergencyServices}
                  onChange={handleChange}
                />
                Emergency services attended
              </label>
              {form.emergencyServices ? (
                <div className="flex flex-wrap gap-3">
                  {EMERGENCY_OPTIONS.map((option) => (
                    <label key={option} className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={(form.emergencyServicesTypes || []).includes(option)}
                        onChange={() => toggleEmergencyType(option)}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>

            <YesNoField
              name="injuries"
              label="Injuries"
              detailsName="injuriesDetails"
              detailsLabel="Injury details"
              checked={form.injuries}
              detailsValue={form.injuriesDetails}
              onChange={handleChange}
            />
            <YesNoField
              name="hospital"
              label="Hospital attendance"
              detailsName="hospitalDetails"
              detailsLabel="Hospital details"
              checked={form.hospital}
              detailsValue={form.hospitalDetails}
              onChange={handleChange}
            />
            <YesNoField
              name="clVehicleDamage"
              label="Country Lion vehicle damage"
              detailsName="clVehicleDamageDetails"
              detailsLabel="Damage details"
              checked={form.clVehicleDamage}
              detailsValue={form.clVehicleDamageDetails}
              onChange={handleChange}
            />

            <div className="space-y-2 rounded-lg border border-[#1a2540] bg-[#060e1a]/40 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" name="thirdPartyVehicle" checked={form.thirdPartyVehicle} onChange={handleChange} />
                Third-party vehicle involved
              </label>
              {form.thirdPartyVehicle ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input name="thirdPartyReg" value={form.thirdPartyReg} onChange={handleChange} className={`${inputClass} uppercase`} placeholder="Registration" />
                  <input name="thirdPartyMake" value={form.thirdPartyMake} onChange={handleChange} className={inputClass} placeholder="Make" />
                  <input name="thirdPartyModel" value={form.thirdPartyModel} onChange={handleChange} className={inputClass} placeholder="Model" />
                  <input name="thirdPartyDriver" value={form.thirdPartyDriver} onChange={handleChange} className={inputClass} placeholder="Driver name" />
                  <textarea name="thirdPartyDamage" value={form.thirdPartyDamage} onChange={handleChange} rows={5} className={`${textareaClass} md:col-span-2`} placeholder="Damage details" />
                </div>
              ) : null}
            </div>

            <YesNoField
              name="propertyDamage"
              label="Property damage"
              detailsName="propertyDamageDetails"
              detailsLabel="Property damage details"
              checked={form.propertyDamage}
              detailsValue={form.propertyDamageDetails}
              onChange={handleChange}
            />

            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-xs uppercase text-slate-500">Images</span>
                <input type="file" accept="image/*" multiple onChange={uploadImages} disabled={uploading || !caseId} className="block text-sm text-slate-300" />
              </label>
              {!caseId ? (
                <p className="text-xs text-slate-500">Image upload is available when this bump card is linked to a recorded accident case.</p>
              ) : null}
              {uploading ? <p className="text-xs text-slate-400">Uploading…</p> : null}
              {imageUrls.length > 0 ? (
                <ul className="space-y-1">
                  {imageUrls.map((url) => (
                    <li key={url} className="text-xs text-indigo-300 truncate">{url}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <label className="block space-y-1">
              <span className="text-xs uppercase text-slate-500">Additional comments</span>
              <textarea name="comments" value={form.comments} onChange={handleChange} rows={6} className={textareaClass} placeholder="Add as much detail as needed" />
            </label>

            <button
              type="button"
              onClick={submit}
              disabled={saving || !canSubmit}
              className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Submitting…' : 'Submit bump card'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
