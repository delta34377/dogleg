// Admin → Stats Engine: observability for the handicap/Dogleg Score layer,
// a per-user diagnostic (the "why doesn't X have a handicap" answer), and
// retention cohorts. Data comes from the *_admin RPCs in
// database/admin_stats_engine.sql (server-side admin check inside each).
import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Search } from 'lucide-react';

const GREEN = '#16a34a';

function Tile({ label, value, sub, warn = false }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${warn ? 'text-amber-600' : 'text-gray-900'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

// Retention cell shading: darker green = more of the cohort came back
const retentionCellClass = (p) => {
  if (p === null || p === undefined) return 'bg-white text-gray-300';
  if (p >= 75) return 'bg-green-300 text-green-950';
  if (p >= 50) return 'bg-green-200 text-green-900';
  if (p >= 25) return 'bg-green-100 text-green-900';
  if (p > 0) return 'bg-green-50 text-green-800';
  return 'bg-gray-50 text-gray-400';
};

function UserLookup() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_user_stats_diagnostic_admin', {
      p_username: query.trim(),
    });
    setResult(error ? { error: error.message } : data);
    setLoading(false);
  };

  const summary = result?.summary;

  return (
    <Section
      title="User diagnostic"
      subtitle="Why does / doesn't a user have an index and Dogleg Scores — per round"
    >
      <form onSubmit={lookup} className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="username"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300"
        >
          {loading ? 'Looking…' : 'Look up'}
        </button>
      </form>

      {result?.error && (
        <p className="mt-3 text-sm text-red-600">{result.error}</p>
      )}

      {result && !result.error && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-gray-900">{result.profile?.username}</span>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs tabular-nums">
              index: {result.profile?.handicap_index ?? '—'}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs tabular-nums">
              manual handicap: {result.profile?.manual_handicap ?? '—'}
            </span>
            {result.profile?.is_banned && (
              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">banned</span>
            )}
          </div>

          {summary && (
            <p className="text-sm text-gray-600">
              {summary.counting} counting {summary.counting === 1 ? 'round' : 'rounds'}
              {summary.pending_nines > 0 && (
                <> · {summary.pending_nines} pending {summary.pending_nines === 1 ? 'nine' : 'nines'}
                  {' '}({summary.pairs_available} {summary.pairs_available === 1 ? 'pair' : 'pairs'} available)</>
              )}
              {summary.needed_for_index > 0
                ? <> · <span className="font-medium text-amber-700">
                    needs {summary.needed_for_index} more counting-round{summary.needed_for_index === 1 ? '' : 's'} worth for an index
                  </span></>
                : <> · <span className="font-medium text-green-700">index bar met</span></>}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-3 font-medium">Played</th>
                  <th className="py-2 pr-3 font-medium">Score</th>
                  <th className="py-2 pr-3 font-medium">Holes</th>
                  <th className="py-2 pr-3 font-medium">Differential</th>
                  <th className="py-2 pr-3 font-medium">Dogleg</th>
                  <th className="py-2 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(result.rounds || []).map((r) => (
                  <tr key={`${r.short_code}-${r.created_at}`}>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{r.played_at}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.total_score ?? '—'}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.holes_played ?? '—'}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.differential ?? '—'}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.dogleg_score ?? '—'}</td>
                    <td className={`py-2 text-xs ${
                      r.verdict === 'counts toward index' ? 'text-green-700' : 'text-amber-700'
                    }`}>
                      {r.verdict}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Section>
  );
}

const AdminStatsEngine = () => {
  const [engine, setEngine] = useState(null);
  const [cohorts, setCohorts] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [engineRes, cohortRes] = await Promise.all([
        supabase.rpc('get_stats_engine_admin'),
        supabase.rpc('get_retention_cohorts_admin', { p_weeks: 12 }),
      ]);
      if (cancelled) return;
      if (engineRes.error) {
        setError(engineRes.error.message);
      } else {
        setEngine(engineRes.data);
        setCohorts(cohortRes.data || []);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-700 font-medium mb-1">Stats Engine panel unavailable</p>
        <p className="text-sm text-gray-500">
          {error.includes('function') || error.includes('schema')
            ? 'Run database/admin_stats_engine.sql (after stats_layer.sql) in the Supabase SQL editor.'
            : error}
        </p>
      </div>
    );
  }

  const distData = (engine?.dogleg_distribution || []).map((b) => ({
    label: `${b.bucket}–${b.bucket + 1}`,
    count: b.count,
  }));
  const pendingUsers = engine?.pending_users || [];

  return (
    <div className="space-y-4">
      {/* Engine health */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label="Counting rounds"
          value={engine.rounds_counting}
          sub={`of ${engine.rounds_total} live rounds`}
        />
        <Tile
          label="Pending nines"
          value={engine.pending_nines}
          sub={engine.stuck_18s > 0 ? `+ ${engine.stuck_18s} stuck 18s` : 'stuck 18s: 0'}
          warn={engine.pending_nines > 0 || engine.stuck_18s > 0}
        />
        <Tile
          label="Users with an index"
          value={engine.users_with_index}
          sub={`of ${engine.users_with_rounds} with rounds · ${engine.users_with_manual} manual`}
        />
        <Tile
          label="Median Dogleg Score"
          value={engine.dogleg_median ?? '—'}
          sub="healthy ≈ 6.0"
          warn={engine.dogleg_median !== null && Math.abs(engine.dogleg_median - 6) > 0.7}
        />
      </div>

      {/* Capture quality */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Picked-tee ratings" value={pct(engine.counting_picked_tee, engine.rounds_counting)}
          sub="of counting rounds (rest are estimated)" />
        <Tile label="Hole-by-hole entries" value={pct(engine.rounds_hole_by_hole, engine.rounds_total)} />
        <Tile label="Putts tracked" value={pct(engine.rounds_putts_tracked, engine.rounds_total)} />
        <Tile label="Nine-hole rounds" value={pct(engine.rounds_9, engine.rounds_total)} />
      </div>

      {/* Dogleg Score distribution */}
      <Section
        title="Dogleg Score distribution"
        subtitle={`${engine.dogleg_scored} scored rounds — should bell around 6.0; drift means the engine is miscalibrated`}
      >
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="count" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* Pending users */}
      <Section
        title="Users with pending nines"
        subtitle="Rounds waiting on a handicap signal — after the pairing bootstrap this should stay near empty"
      >
        {pendingUsers.length === 0 ? (
          <p className="text-sm text-gray-500">None — every nine on the books has converted. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-3 font-medium">User</th>
                  <th className="py-2 pr-3 font-medium">Pending nines</th>
                  <th className="py-2 pr-3 font-medium">Counting</th>
                  <th className="py-2 pr-3 font-medium">Manual handicap</th>
                  <th className="py-2 font-medium">Index</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingUsers.map((u) => (
                  <tr key={u.username}>
                    <td className="py-2 pr-3 font-medium text-gray-900">{u.username}</td>
                    <td className="py-2 pr-3 tabular-nums text-amber-700">{u.pending}</td>
                    <td className="py-2 pr-3 tabular-nums">{u.counting}</td>
                    <td className="py-2 pr-3">{u.has_manual ? 'yes' : '—'}</td>
                    <td className="py-2 tabular-nums">{u.handicap_index ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* User lookup */}
      <UserLookup />

      {/* Retention cohorts */}
      <Section
        title="Retention cohorts"
        subtitle="Of each signup week, the share who posted a round N weeks later — the chart that tests the stats-retention thesis"
      >
        {(!cohorts || cohorts.length === 0) ? (
          <p className="text-sm text-gray-500">No signups in the last 12 weeks.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm border-separate" style={{ borderSpacing: '2px' }}>
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-1 pr-3 font-medium">Cohort</th>
                  <th className="py-1 pr-3 font-medium">Size</th>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((w) => (
                    <th key={w} className="py-1 px-2 font-medium text-center">W{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => {
                  const byWeek = new Map((c.retention || []).map((r) => [r.week, r.pct]));
                  return (
                    <tr key={c.cohort_week}>
                      <td className="py-1 pr-3 whitespace-nowrap tabular-nums text-gray-700">{c.cohort_week}</td>
                      <td className="py-1 pr-3 tabular-nums text-gray-700">{c.cohort_size}</td>
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((w) => {
                        const p = byWeek.has(w) ? byWeek.get(w) : null;
                        return (
                          <td key={w}
                            className={`py-1.5 px-2 text-center text-xs rounded tabular-nums ${retentionCellClass(p)}`}>
                            {p === null ? '' : `${p}%`}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
};

export default AdminStatsEngine;
