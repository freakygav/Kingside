import { useState } from 'react'
import { TAG_INFO } from '@shared/coach/report'
import { LESSONS } from '@shared/lessons'
import { ACHIEVEMENTS, gameRecord, learningStreak, lessonsCompleted, levelFromXp, strengthsAndWeaknesses } from '@shared/progress'
import { THEME_TEXT } from '@shared/puzzles'
import { BarChart, LineChart } from '../components/Charts'
import { useProfile } from '../profile'

function areaLabel(key: string): string {
  if (key.startsWith('game:')) return `${TAG_INFO[key.slice(5)]?.label ?? key.slice(5)} (in your games)`
  return THEME_TEXT[key] ? `${THEME_TEXT[key].name} puzzles` : key
}

export function ProfilePage() {
  const { profile, reload } = useProfile()
  const [confirm, setConfirm] = useState(false)
  if (!profile) return <main className="page"><div className="page-loading">Loading profile…</div></main>
  const now = Date.now()
  const lvl = levelFromXp(profile.xp)
  const rec = gameRecord(profile)
  const streak = learningStreak(profile.activityDays, now)
  const sw = strengthsAndWeaknesses(profile)
  const pz = profile.puzzles
  const acc = pz.attempted ? Math.round((pz.solved / pz.attempted) * 100) : null
  const xpDays = [...Array(14)].map((_, i) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (13 - i))
    const next = d.getTime() + 86_400_000
    const v = profile.xpLog.filter((x) => x.t >= d.getTime() && x.t < next).reduce((s, x) => s + x.amount, 0)
    return { label: `${d.getMonth() + 1}/${d.getDate()}`, v, title: d.toDateString() }
  })
  const earned = ACHIEVEMENTS.filter((a) => profile.achievements[a.id])

  return (
    <main className="page" data-testid="profile-page">
      <div className="page-head profile-head">
        <div className="lvl-badge"><span>Lv</span><b>{lvl.level}</b></div>
        <div className="lvl-info">
          <h1>Your training profile</h1>
          <div className="meter wide"><i style={{ width: `${(lvl.into / lvl.span) * 100}%` }} /></div>
          <span className="muted small">{profile.xp} XP total · {lvl.span - lvl.into} XP to level {lvl.level + 1} · {streak}-day learning streak</span>
        </div>
      </div>

      <div className="dash-grid six">
        <div className="stat-card">
          <span className="stat-label">Estimated playing Elo</span>
          <span className="stat-value">{profile.playing.games ? profile.playing.elo : '—'}</span>
          <span className="muted small">{profile.playing.games ? `Estimate from ${profile.playing.games} game${profile.playing.games === 1 ? '' : 's'} vs Kingside bots — not an official rating` : 'Play a game against the bot to get an estimate'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Puzzle rating</span>
          <span className="stat-value">{pz.rating}</span>
          <span className="muted small">{pz.attempted ? `${pz.attempted} rated attempts` : 'Starts at 1000'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Games</span>
          <span className="stat-value">{rec.played}</span>
          <span className="muted small"><span className="good-text">{rec.won} won</span> · <span className="bad-text">{rec.lost} lost</span> · {rec.drawn} drawn</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Lessons completed</span>
          <span className="stat-value">{lessonsCompleted(profile)}<small>/{LESSONS.length}</small></span>
          <span className="meter"><i style={{ width: `${(lessonsCompleted(profile) / LESSONS.length) * 100}%` }} /></span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Puzzles solved</span>
          <span className="stat-value">{pz.solved}</span>
          <span className="muted small">{acc === null ? 'No attempts yet' : `${acc}% accuracy · best streak ${pz.bestStreak}`}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Achievements</span>
          <span className="stat-value">{earned.length}<small>/{ACHIEVEMENTS.length}</small></span>
          <span className="muted small">{profile.counters.gamesReviewed} game{profile.counters.gamesReviewed === 1 ? '' : 's'} reviewed</span>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card"><h3>Estimated playing Elo</h3><LineChart points={profile.playing.history.map((h) => ({ t: h.t, v: h.elo }))} empty="Finish games against the bot to track your estimate." /></div>
        <div className="chart-card"><h3>Puzzle rating</h3><LineChart points={pz.ratingHistory.map((h) => ({ t: h.t, v: h.r }))} empty="Solve puzzles to track your rating." /></div>
        <div className="chart-card"><h3>XP earned per day (last 14 days)</h3><BarChart bars={xpDays} unit=" XP" /></div>
        <div className="chart-card">
          <h3>Strengths and weaknesses</h3>
          {sw.strong.length === 0 && sw.weak.length === 0 ? (
            <div className="chart-empty">Solve at least 3 puzzles of a theme, or review games with a coach, to see your strengths and weaknesses.</div>
          ) : (
            <div className="sw-cols">
              <div><div className="sw-title good-text">Strongest</div>{sw.strong.length ? sw.strong.map((s) => <div key={s} className="sw-item">✓ {areaLabel(s)}</div>) : <div className="muted small">Not enough data yet</div>}</div>
              <div><div className="sw-title bad-text">Needs work</div>{sw.weak.length ? sw.weak.map((s) => <div key={s} className="sw-item">• {areaLabel(s)}</div>) : <div className="muted small">Nothing stands out</div>}</div>
            </div>
          )}
        </div>
      </div>

      <section className="lesson-track">
        <h2>Achievements</h2>
        <div className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const at = profile.achievements[a.id]
            return (
              <div key={a.id} className={`ach-card${at ? ' earned' : ''}`} title={a.description}>
                <span className="ach-icon">{at ? '🏆' : '🔒'}</span>
                <span><b>{a.name}</b><span className="muted small">{a.description}</span>{at && <span className="muted small"> · {new Date(at).toLocaleDateString()}</span>}</span>
                <span className="ach-xp">+{a.xp} XP</span>
              </div>
            )
          })}
        </div>
      </section>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Recent activity</h3>
          {profile.activity.length === 0 ? <div className="chart-empty">Nothing yet — play, solve a puzzle or start a lesson.</div> : (
            <ul className="activity">
              {profile.activity.slice(0, 12).map((a, i) => <li key={i}><span className={`act-kind ${a.kind}`}>{a.kind}</span>{a.text}<span className="muted small"> · {new Date(a.t).toLocaleString()}</span></li>)}
            </ul>
          )}
        </div>
        <div className="chart-card">
          <h3>Recent games</h3>
          {profile.games.length === 0 ? <div className="chart-empty">No finished games yet.</div> : (
            <table className="hist-table">
              <tbody>
                {profile.games.slice(0, 10).map((g) => (
                  <tr key={g.id}>
                    <td className={g.result === 'win' ? 'good-text' : g.result === 'loss' ? 'bad-text' : ''}>{g.result}</td>
                    <td>{g.botElo ? `~${g.botElo}` : 'Full'}</td>
                    <td className="muted">{g.opening ?? '—'}</td>
                    <td className="muted">{g.reviewed ? `${g.accuracy ?? '–'}%` : 'not reviewed'}</td>
                    <td className="muted">{g.date.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="reset-row">
        {!confirm ? (
          <button className="link-btn danger-link" onClick={() => setConfirm(true)}>Reset training progress…</button>
        ) : (
          <span>
            This permanently erases lessons, puzzles, XP, achievements and game history (settings are kept).{' '}
            <button className="ghost-btn small danger" onClick={async () => { await window.kingside.resetProfile(); await reload(); setConfirm(false) }}>Erase everything</button>{' '}
            <button className="ghost-btn small" onClick={() => setConfirm(false)}>Cancel</button>
          </span>
        )}
      </div>
    </main>
  )
}
