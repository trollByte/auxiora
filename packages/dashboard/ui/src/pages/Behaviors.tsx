import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';

type BehaviorType = 'scheduled' | 'monitor' | 'one-shot';
type Frequency = 'daily' | 'weekday' | 'hourly' | 'every-n-hours' | 'weekly' | 'custom';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const LOCAL_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Build a cron expression from the friendly UI inputs. */
function buildCron(freq: Frequency, time: string, everyNHours: number, weekday: number, customCron: string): string {
  if (freq === 'custom') return customCron;
  if (freq === 'hourly') return '0 * * * *';
  if (freq === 'every-n-hours') return `0 */${everyNHours} * * *`;

  const [hh, mm] = time.split(':').map(Number);
  const m = isNaN(mm) ? 0 : mm;
  const h = isNaN(hh) ? 8 : hh;

  if (freq === 'daily') return `${m} ${h} * * *`;
  if (freq === 'weekday') return `${m} ${h} * * 1-5`;
  if (freq === 'weekly') return `${m} ${h} * * ${weekday}`;
  return customCron;
}

/** Try to parse a cron expression back into friendly UI values. */
function parseCron(cron: string): { freq: Frequency; time: string; everyNHours: number; weekday: number } {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return { freq: 'custom', time: '08:00', everyNHours: 2, weekday: 1 };

  const [min, hour, dom, mon, dow] = parts;

  // Hourly: 0 * * * *
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return { freq: 'hourly', time: '08:00', everyNHours: 2, weekday: 1 };
  }

  // Every N hours: 0 */N * * *
  const everyMatch = hour.match(/^\*\/(\d+)$/);
  if (min === '0' && everyMatch && dom === '*' && mon === '*' && dow === '*') {
    return { freq: 'every-n-hours', time: '08:00', everyNHours: parseInt(everyMatch[1], 10), weekday: 1 };
  }

  const m = parseInt(min, 10);
  const h = parseInt(hour, 10);
  if (isNaN(m) || isNaN(h)) return { freq: 'custom', time: '08:00', everyNHours: 2, weekday: 1 };

  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  // Daily: M H * * *
  if (dom === '*' && mon === '*' && dow === '*') {
    return { freq: 'daily', time: timeStr, everyNHours: 2, weekday: 1 };
  }

  // Weekday: M H * * 1-5
  if (dom === '*' && mon === '*' && dow === '1-5') {
    return { freq: 'weekday', time: timeStr, everyNHours: 2, weekday: 1 };
  }

  // Weekly: M H * * N
  const dayNum = parseInt(dow, 10);
  if (dom === '*' && mon === '*' && !isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
    return { freq: 'weekly', time: timeStr, everyNHours: 2, weekday: dayNum };
  }

  return { freq: 'custom', time: timeStr, everyNHours: 2, weekday: 1 };
}

/** Format a cron expression into a human-readable string for display. */
function describeCron(cron: string): string {
  const parsed = parseCron(cron);
  switch (parsed.freq) {
    case 'daily': return `Daily at ${parsed.time}`;
    case 'weekday': return `Weekdays at ${parsed.time}`;
    case 'hourly': return 'Every hour';
    case 'every-n-hours': return `Every ${parsed.everyNHours}h`;
    case 'weekly': return `${DAYS_OF_WEEK[parsed.weekday]}s at ${parsed.time}`;
    default: return cron;
  }
}

export function Behaviors() {
  const { data, refresh } = useApi(() => api.getBehaviors(), []);
  usePolling(refresh);

  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<BehaviorType>('scheduled');
  const [action, setAction] = useState('');

  // Friendly schedule state
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [everyNHours, setEveryNHours] = useState(2);
  const [weekday, setWeekday] = useState(1); // Monday
  const [customCron, setCustomCron] = useState('');
  const [timezone, setTimezone] = useState(LOCAL_TIMEZONE);

  // Monitor state
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [condition, setCondition] = useState('');

  // One-shot state
  const [runAt, setRunAt] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const behaviors = data?.data ?? [];

  const cronPreview = useMemo(
    () => buildCron(frequency, scheduleTime, everyNHours, weekday, customCron),
    [frequency, scheduleTime, everyNHours, weekday, customCron],
  );

  const columns = [
    { key: 'action', label: 'Action', render: (b: any) => b.action?.slice(0, 60) },
    { key: 'type', label: 'Type' },
    {
      key: 'schedule', label: 'Schedule', render: (b: any) => {
        if (b.schedule?.cron) return describeCron(b.schedule.cron);
        if (b.polling) return `Every ${Math.round(b.polling.intervalMs / 60000)}m`;
        if (b.delay?.fireAt) return new Date(b.delay.fireAt).toLocaleString();
        return '-';
      },
    },
    { key: 'status', label: 'Status', render: (b: any) => <StatusBadge status={b.status} /> },
    { key: 'runCount', label: 'Runs' },
    { key: 'failCount', label: 'Fails' },
    { key: 'lastRun', label: 'Last Run', render: (b: any) => b.lastRun ? new Date(b.lastRun).toLocaleString() : '-' },
  ];

  const handleToggle = async (b: any) => {
    try {
      const newStatus = b.status === 'active' ? 'paused' : 'active';
      await api.patchBehavior(b.id, { status: newStatus });
      refresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update behavior');
    }
  };

  const handleDelete = async (b: any) => {
    if (!confirm(`Delete behavior "${b.action?.slice(0, 40)}"?`)) return;
    try {
      await api.deleteBehavior(b.id);
      refresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete behavior');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setType('scheduled');
    setAction('');
    setFrequency('daily');
    setScheduleTime('08:00');
    setEveryNHours(2);
    setWeekday(1);
    setCustomCron('');
    setTimezone(LOCAL_TIMEZONE);
    setIntervalMinutes(5);
    setCondition('');
    setRunAt('');
    setError('');
    setSuccess('');
  };

  const openCreate = () => {
    resetForm();
    setFormMode('create');
  };

  const openEdit = (b: any) => {
    setEditingId(b.id);
    setType(b.type ?? 'scheduled');
    setAction(b.action ?? '');

    if (b.schedule?.cron) {
      const parsed = parseCron(b.schedule.cron);
      setFrequency(parsed.freq);
      setScheduleTime(parsed.time);
      setEveryNHours(parsed.everyNHours);
      setWeekday(parsed.weekday);
      setCustomCron(parsed.freq === 'custom' ? b.schedule.cron : '');
    }
    setTimezone(b.schedule?.timezone ?? LOCAL_TIMEZONE);

    if (b.polling) {
      setIntervalMinutes(Math.round(b.polling.intervalMs / 60000));
      setCondition(b.polling.condition ?? '');
    }
    if (b.delay?.fireAt) {
      const dt = new Date(b.delay.fireAt);
      setRunAt(dt.toISOString().slice(0, 16));
    }

    setError('');
    setSuccess('');
    setFormMode('edit');
  };

  const closeForm = () => {
    resetForm();
    setFormMode('closed');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const input: Record<string, unknown> = { action };
      if (type === 'scheduled') {
        input.cron = cronPreview;
        input.timezone = timezone;
      } else if (type === 'monitor') {
        input.intervalMinutes = intervalMinutes;
        input.condition = condition;
      } else if (type === 'one-shot') {
        input.runAt = runAt;
      }

      if (formMode === 'edit' && editingId) {
        await api.patchBehavior(editingId, input);
        setSuccess('Behavior updated');
      } else {
        input.type = type;
        await api.createBehavior(input);
        setSuccess('Behavior created');
      }

      resetForm();
      setFormMode('closed');
      refresh();
    } catch (err: any) {
      setError(err.message || `Failed to ${formMode === 'edit' ? 'update' : 'create'} behavior`);
    } finally {
      setSaving(false);
    }
  };

  const showTimePicker = frequency === 'daily' || frequency === 'weekday' || frequency === 'weekly';

  return (
    <div className="page">
      <h2>Behaviors</h2>

      <div className="create-form-toggle">
        <button
          className="btn-sm"
          onClick={() => formMode !== 'closed' ? closeForm() : openCreate()}
        >
          {formMode !== 'closed' ? 'Cancel' : 'New Behavior'}
        </button>
      </div>

      {formMode !== 'closed' && (
        <div className="create-form">
          <form onSubmit={handleSubmit}>
            <h3>{formMode === 'edit' ? 'Edit Behavior' : 'New Behavior'}</h3>

            {formMode === 'create' && (
              <>
                <label>Type</label>
                <select value={type} onChange={e => setType(e.target.value as BehaviorType)}>
                  <option value="scheduled">Scheduled</option>
                  <option value="monitor">Monitor (polling)</option>
                  <option value="one-shot">One-shot (run once)</option>
                </select>
              </>
            )}

            <label>Action</label>
            <textarea
              value={action}
              onChange={e => setAction(e.target.value)}
              placeholder="What should the agent do?"
              required
              rows={3}
            />

            {type === 'scheduled' && (
              <div className="create-form-group">
                <label>How often?</label>
                <select value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}>
                  <option value="daily">Every day</option>
                  <option value="weekday">Every weekday (Mon-Fri)</option>
                  <option value="weekly">Once a week</option>
                  <option value="hourly">Every hour</option>
                  <option value="every-n-hours">Every few hours</option>
                  <option value="custom">Custom (cron)</option>
                </select>

                {frequency === 'weekly' && (
                  <>
                    <label>Day of week</label>
                    <select value={weekday} onChange={e => setWeekday(Number(e.target.value))}>
                      {DAYS_OF_WEEK.map((day, i) => (
                        <option key={i} value={i}>{day}</option>
                      ))}
                    </select>
                  </>
                )}

                {showTimePicker && (
                  <>
                    <label>Time</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      required
                    />
                  </>
                )}

                {frequency === 'every-n-hours' && (
                  <>
                    <label>Every how many hours?</label>
                    <input
                      type="number"
                      value={everyNHours}
                      onChange={e => setEveryNHours(Number(e.target.value))}
                      min={1}
                      max={23}
                      required
                    />
                  </>
                )}

                {frequency === 'custom' && (
                  <>
                    <label>Cron expression</label>
                    <input
                      type="text"
                      value={customCron}
                      onChange={e => setCustomCron(e.target.value)}
                      placeholder="0 8 * * *"
                      required
                    />
                  </>
                )}

                <label>Timezone</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                />

                <div className="form-hint">
                  Schedule: <strong>{describeCron(cronPreview)}</strong> ({timezone})
                </div>
              </div>
            )}

            {type === 'monitor' && (
              <div className="create-form-group">
                <label>Check every (minutes)</label>
                <input
                  type="number"
                  value={intervalMinutes}
                  onChange={e => setIntervalMinutes(Number(e.target.value))}
                  min={1}
                  required
                />
                <label>Condition</label>
                <textarea
                  value={condition}
                  onChange={e => setCondition(e.target.value)}
                  placeholder="When should this trigger?"
                  required
                  rows={2}
                />
              </div>
            )}

            {type === 'one-shot' && (
              <div className="create-form-group">
                <label>Run at</label>
                <input
                  type="datetime-local"
                  value={runAt}
                  onChange={e => setRunAt(e.target.value)}
                  required
                />
              </div>
            )}

            {error && <div className="error">{error}</div>}
            {success && <div className="settings-success">{success}</div>}

            <button type="submit" className="settings-btn" disabled={saving || !action}>
              {saving ? 'Saving...' : formMode === 'edit' ? 'Save Changes' : 'Create Behavior'}
            </button>
          </form>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={behaviors}
        keyField="id"
        actions={(b: any) => (
          <>
            <button className="btn-sm" onClick={() => openEdit(b)}>Edit</button>
            <button className="btn-sm" onClick={() => handleToggle(b)}>
              {b.status === 'active' ? 'Pause' : 'Resume'}
            </button>
            <button className="btn-sm btn-danger" onClick={() => handleDelete(b)}>Delete</button>
          </>
        )}
      />
    </div>
  );
}
