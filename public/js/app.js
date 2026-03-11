/* ===== Stanford Men's Gymnastics 2026 - App ===== */

(function () {
  'use strict';

  let meets = [];
  let photos = {};
  let bios = {};
  let meetPhotos = {};
  let currentFilter = 'all';
  let currentView = 'season';
  let lastRefreshedTime = null;
  let autoRefreshInterval = null;
  let autoRefreshEnabled = false;

  const EVENT_NAMES = {
    floor: 'Floor', pommel: 'Pommel Horse', rings: 'Still Rings',
    vault: 'Vault', pbars: 'Parallel Bars', hbar: 'High Bar', aa: 'All-Around'
  };

  const EVENT_SHORT = {
    floor: 'FX', pommel: 'PH', rings: 'SR', vault: 'VT', pbars: 'PB', hbar: 'HB', aa: 'AA'
  };

  const EVENTS = ['floor', 'pommel', 'rings', 'vault', 'pbars', 'hbar'];

  // ===== Utility =====
  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatDateLong(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function timeAgo(date) {
    if (!date) return 'never';
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function hasLiveMeets() {
    return meets.some(m => m.status === 'in_progress');
  }

  // ===== Shared Stats Helpers =====
  function mean(arr) { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null; }
  function stddev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s,v)=>s+Math.pow(v-m,2),0)/(arr.length-1));
  }
  function pearson(xs, ys) {
    const n = xs.length; if (n < 3) return null;
    const mx = mean(xs), my = mean(ys);
    const num = xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0);
    const den = Math.sqrt(xs.reduce((s,x)=>s+Math.pow(x-mx,2),0)*ys.reduce((s,y)=>s+Math.pow(y-my,2),0));
    return den === 0 ? null : num/den;
  }
  function fmt(n, dp=3) { return n!=null&&!isNaN(n) ? n.toFixed(dp) : '—'; }

  // ===== Toast Notifications =====
  function showToast(message, type = 'default', duration = 4000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ===== Last Updated =====
  function updateLastUpdatedDisplay() {
    const bar = document.getElementById('lastUpdatedBar');
    const text = document.getElementById('lastUpdatedText');
    if (lastRefreshedTime) {
      bar.style.display = '';
      text.textContent = `Last updated: ${timeAgo(lastRefreshedTime)}`;
    }
  }

  setInterval(updateLastUpdatedDisplay, 30000);

  // ===== Refresh =====
  async function doRefresh() {
    const btn = document.getElementById('refreshBtn');
    const mobileBtn = document.getElementById('refreshBtnMobile');

    btn.disabled = true;
    btn.classList.add('refreshing');
    if (mobileBtn) mobileBtn.classList.add('refreshing');

    const labelEl = btn.querySelector('.refresh-label');
    if (labelEl) labelEl.textContent = 'Refreshing...';

    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        const meetsRes = await fetch('/api/meets');
        const oldMeets = meets.slice();
        meets = await meetsRes.json();

        lastRefreshedTime = new Date();
        updateLastUpdatedDisplay();

        if (currentView === 'season') renderSeason();
        else if (currentView === 'gymnasts') renderGymnasts();
        else if (currentView === 'leaderboards') renderLeaderboard(document.querySelector('.event-tab.active')?.dataset.event || 'floor');

        const summary = data.summary;
        if (summary && summary.meetsInProgress > 0) {
          showToast('⚡ Live meet in progress — scores updating', 'live');
        } else if (summary && summary.meetsUpdated > 0) {
          showToast(`✅ Updated — ${summary.meetsUpdated} meet${summary.meetsUpdated > 1 ? 's' : ''} refreshed`, 'success');
        } else {
          showToast('✅ Data is up to date', 'success');
        }

        highlightChanges(oldMeets, meets);
      } else {
        showToast('❌ Refresh failed — ' + (data.error || 'unknown error'), 'error');
      }
    } catch (err) {
      showToast('❌ Refresh failed — check connection', 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('refreshing');
      if (mobileBtn) mobileBtn.classList.remove('refreshing');
      if (labelEl) labelEl.textContent = 'Refresh';
    }
  }

  function highlightChanges(oldMeets, newMeets) {
    setTimeout(() => {
      const oldMap = {};
      oldMeets.forEach(m => { oldMap[m.id] = m; });

      newMeets.forEach(m => {
        const old = oldMap[m.id];
        if (old && old.stanfordScore !== m.stanfordScore) {
          const card = document.querySelector(`[data-meet-id="${m.id}"]`);
          if (card) {
            const scoreEl = card.querySelector('.score-stanford');
            if (scoreEl) scoreEl.classList.add('score-updated');
          }
        }
      });
    }, 100);
  }

  // ===== Auto-Refresh =====
  function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    const toggle = document.querySelector('.toggle-switch');
    if (toggle) toggle.classList.toggle('active', autoRefreshEnabled);

    if (autoRefreshEnabled) {
      autoRefreshInterval = setInterval(doRefresh, 60000);
      showToast('🔄 Auto-refresh enabled (every 60s)', 'default');
    } else {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
      showToast('Auto-refresh disabled', 'default');
    }
  }

  // ===== Data Loading =====
  async function loadData() {
    try {
      const [meetsRes, photosRes, biosRes, meetPhotosRes] = await Promise.all([
        fetch('/api/meets'), fetch('/api/photos'), fetch('/api/bios'), fetch('/api/meet-photos')
      ]);
      meets = await meetsRes.json();
      photos = await photosRes.json();
      bios = await biosRes.json();
      meetPhotos = await meetPhotosRes.json();

      const refreshed = meets.find(m => m.lastRefreshed);
      if (refreshed) {
        lastRefreshedTime = new Date(refreshed.lastRefreshed);
        updateLastUpdatedDisplay();
      }

      document.getElementById('loading').style.display = 'none';

      // Build search index
      if (window.StanfordSearch) {
        StanfordSearch.buildIndex(meets);
        StanfordSearch.createUI();
        StanfordSearch.onGymnastSelect = function (name) {
          showView('gymnasts');
          showGymnastProfile(typeof name === 'string' ? name : name.name);
        };
        StanfordSearch.onMeetSelect = function (meetId) {
          showMeetDetail(typeof meetId === 'string' ? meetId : meetId.id);
        };
        StanfordSearch.onLeaderboardSelect = function (event) {
          showView('leaderboards');
          renderLeaderboard(typeof event === 'string' ? event : event.key);
        };
        StanfordSearch.onFilterSelect = function (filter) {
          showView('season');
          currentFilter = typeof filter === 'string' ? filter : 'all';
          document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.filter === currentFilter);
          });
          renderMeetCards();
        };
      }

      showView('season');
    } catch (err) {
      document.getElementById('loading').innerHTML =
        '<div class="empty-state"><div class="empty-icon">😕</div><p class="empty-text">Failed to load data. Is the server running?</p></div>';
    }
  }

  // ===== Navigation =====
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function showView(view) {
    currentView = view;
    scrollToTop();
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(l => {
      if (l.dataset.view) l.classList.remove('active');
    });
    document.querySelectorAll(`[data-view="${view}"]`).forEach(l => l.classList.add('active'));

    const el = document.getElementById(`view-${view}`);
    if (el) {
      el.style.display = 'block';
      el.style.animation = 'none';
      el.offsetHeight;
      el.style.animation = '';
    }

    if (view === 'season') renderSeason();
    else if (view === 'gymnasts') renderGymnasts();
    else if (view === 'leaderboards') { renderHeatMap(); renderLeaderboard('floor'); }
    else if (view === 'insights') renderInsights();
  }

  // ===== Mission Control Utilities =====
  function animateValue(el, start, end, duration, decimals) {
    if (!el) return;
    const range = end - start;
    const startTime = performance.now();
    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = decimals === 0
        ? Math.round(start + range * ease)
        : (start + range * ease).toFixed(decimals);
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  function mcMean(arr) { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null; }

  // ===== Mission Control Dashboard =====
  function renderMissionControl() {
    const mc = document.getElementById('missionControl');
    if (!mc) return;

    const compDays = [];
    const seenD = new Set();
    meets.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(m => {
      if (seenD.has(m.date)) return; seenD.add(m.date);
      if (!m.stanfordScore || m.stanfordScore <= 0) return;
      compDays.push({ date: m.date, total: m.stanfordScore, isHome: m.isHome });
    });

    const scoredMeets = meets.filter(m => m.result === 'W' || m.result === 'L');
    const wins = meets.filter(m => m.result === 'W').length;
    const losses = meets.filter(m => m.result === 'L').length;

    const allScores = compDays.map(d=>d.total);
    const homeScores = compDays.filter(d=>d.isHome).map(d=>d.total);
    const awayScores = compDays.filter(d=>!d.isHome).map(d=>d.total);
    const teamAvg = mcMean(allScores);
    const homeAvg = mcMean(homeScores);
    const awayAvg = mcMean(awayScores);
    const seasonHigh = allScores.length ? Math.max(...allScores) : null;
    const homeDiff = homeAvg && teamAvg ? homeAvg - teamAvg : null;

    // Season trajectory
    const half = Math.floor(allScores.length / 2);
    const firstHalf = mcMean(allScores.slice(0, half));
    const secondHalf = mcMean(allScores.slice(half));
    const trajectory = firstHalf && secondHalf ? secondHalf - firstHalf : null;
    const trajArrow = trajectory == null ? '' : trajectory > 0.1 ? '🚀' : trajectory < -0.1 ? '📉' : '→';
    const trajLabel = trajectory == null ? '' : trajectory > 0.1 ? `Up ${trajectory.toFixed(2)} pts vs early season` : trajectory < -0.1 ? `Down ${Math.abs(trajectory).toFixed(2)} pts vs early season` : 'Flat season trend';

    // Event trends
    const EVemoji = {floor:'🤸',pommel:'🐎',rings:'💪',vault:'🏃',pbars:'⚡',hbar:'🔥'};
    const EVlabel = {floor:'FLOOR',pommel:'POMMEL',rings:'RINGS',vault:'VAULT',pbars:'P-BARS',hbar:'H-BAR'};

    function eventTrend(ev) {
      const dates = [...seenD].slice().sort();
      const pts = [];
      dates.forEach(date => {
        const m = meets.find(m2=>m2.date===date);
        if (!m || !m.athletes) return;
        const stanford = m.athletes.filter(a=>a.team==='Stanford');
        const evScores = stanford.map(a=>a.scores[ev]).filter(s=>s!==undefined&&s>0);
        if (evScores.length) pts.push({ date, avg: mcMean(evScores) });
      });
      if (pts.length < 4) return { avg: mcMean(pts.map(p=>p.avg)), trend: 0 };
      const firstAvg = mcMean(pts.slice(0,3).map(p=>p.avg));
      const lastAvg  = mcMean(pts.slice(-3).map(p=>p.avg));
      return { avg: mcMean(pts.map(p=>p.avg)), trend: lastAvg - firstAvg, recent: lastAvg };
    }

    const evData = {};
    EVENTS.forEach(ev => { evData[ev] = eventTrend(ev); });

    // Hot/Cold gymnasts
    function gymnLastN(name, n) {
      const scored = [];
      const dates = new Set();
      meets.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(m => {
        if (dates.size >= n || dates.has(m.date)) return;
        const a = m.athletes ? m.athletes.find(x=>x.name===name&&x.team==='Stanford') : null;
        if (!a) return;
        const evScores = EVENTS.map(ev=>a.scores[ev]).filter(s=>s!==undefined&&s>0);
        if (!evScores.length) return;
        dates.add(m.date);
        evScores.forEach(s=>scored.push(s));
      });
      return mcMean(scored);
    }
    function gymnSeasonAvg(name) {
      const scores = [];
      const seen = new Set();
      meets.forEach(m => {
        if (seen.has(m.date) || !m.athletes) return;
        const a = m.athletes.find(x=>x.name===name&&x.team==='Stanford');
        if (!a) return;
        const evScores = EVENTS.map(ev=>a.scores[ev]).filter(s=>s!==undefined&&s>0);
        if (!evScores.length) return;
        seen.add(m.date);
        evScores.forEach(s=>scores.push(s));
      });
      return mcMean(scores);
    }

    const gymnasts = [...new Set(meets.flatMap(m=>(m.athletes||[]).filter(a=>a.team==='Stanford').map(a=>a.name)))];
    const gymnForm = gymnasts.map(name => {
      const recent = gymnLastN(name, 3);
      const season = gymnSeasonAvg(name);
      if (!recent || !season) return null;
      return { name, recent, season, diff: recent - season };
    }).filter(Boolean).sort((a,b)=>b.diff-a.diff);

    const hot = gymnForm.slice(0,3).filter(g=>g.diff>0.01);
    const cold = gymnForm.slice(-3).filter(g=>g.diff<-0.01).reverse();

    // Record context
    const need500 = Math.max(0, losses - wins);
    const gamesLeft = meets.filter(m=>m.status==='upcoming').length;
    const recordContext = need500 > 0
      ? `Need ${need500} more W${need500>1?'s':''} to reach .500 — ${gamesLeft} meets left`
      : wins > losses ? `${wins-losses} game${wins-losses>1?'s':''} above .500 🔥` : 'Sitting at .500';

    mc.innerHTML = `
      <div class="mc-header">
        <div class="mc-title">⚡ STANFORD CARDINAL — 2026 SEASON WAR ROOM</div>
        <div class="mc-subtitle">Men's Gymnastics • Live Analytics</div>
      </div>
      <div class="mc-stat-row">
        <div class="mc-stat-card mc-record">
          <div class="mc-stat-value" id="mcWins">0</div>
          <div class="mc-stat-sub">—</div>
          <div class="mc-stat-value" id="mcLosses">0</div>
          <div class="mc-stat-label">W — L</div>
          <div class="mc-context">${recordContext}</div>
        </div>
        <div class="mc-stat-card">
          <div class="mc-stat-value" id="mcAvg">0.00</div>
          <div class="mc-stat-label">Team Avg</div>
          <div class="mc-context">${trajArrow} ${trajLabel}</div>
        </div>
        <div class="mc-stat-card">
          <div class="mc-stat-value" id="mcHome">0.00</div>
          <div class="mc-stat-label">Home Avg</div>
          <div class="mc-context">${homeAvg && teamAvg ? (homeDiff >= 0 ? '+' : '') + homeDiff.toFixed(2) + ' vs away' : ''}</div>
        </div>
        <div class="mc-stat-card">
          <div class="mc-stat-value" id="mcAway">0.00</div>
          <div class="mc-stat-label">Away Avg</div>
          <div class="mc-context">${awayScores.length} road meet${awayScores.length!==1?'s':''}</div>
        </div>
        <div class="mc-stat-card mc-high">
          <div class="mc-stat-value" id="mcHigh">0.00</div>
          <div class="mc-stat-label">Season High 🏆</div>
          <div class="mc-context">${compDays.find(d=>d.total===seasonHigh)?.date || ''}</div>
        </div>
      </div>

      <div class="mc-event-row">
        ${EVENTS.map(ev => {
          const d = evData[ev];
          const arrow = d.trend > 0.03 ? '▲' : d.trend < -0.03 ? '▼' : '→';
          const arrowColor = d.trend > 0.03 ? '#2ecc71' : d.trend < -0.03 ? '#e74c3c' : '#aaa';
          const barPct = Math.round(((d.avg||0) - 13.5) / 1.5 * 100);
          return `<div class="mc-event-card">
            <div class="mc-ev-label">${EVemoji[ev]} ${EVlabel[ev]}</div>
            <div class="mc-ev-avg">${d.avg != null ? d.avg.toFixed(3) : '—'}</div>
            <div class="mc-ev-trend" style="color:${arrowColor}">${arrow} ${d.trend!=null?((d.trend>=0?'+':'')+d.trend.toFixed(3)+' trend'):'—'}</div>
            <div class="mc-ev-bar-wrap"><div class="mc-ev-bar" style="width:${Math.max(0,Math.min(100,barPct))}%"></div></div>
          </div>`;
        }).join('')}
      </div>

      <div class="mc-hotcold-row">
        <div class="mc-hot-card">
          <div class="mc-hot-title">🔥 Running Hot <span class="mc-hot-sub">(last 3 meets vs season avg)</span></div>
          ${hot.length ? hot.map(g => `
            <div class="mc-gymnast-row" data-gymnast="${g.name}">
              ${photos[g.name] ? `<img src="${photos[g.name]}" class="mc-tiny-photo">` : '<div class="mc-tiny-photo-placeholder"></div>'}
              <span class="mc-gyname clickable-name" data-gymnast="${g.name}">${g.name}</span>
              <span class="mc-gystat">${g.recent.toFixed(3)}</span>
              <span class="mc-gydiff" style="color:#2ecc71">+${g.diff.toFixed(3)}</span>
            </div>`).join('')
          : '<div class="mc-empty">No hot streaks detected yet</div>'}
        </div>
        <div class="mc-cold-card">
          <div class="mc-hot-title">🧊 Running Cold <span class="mc-hot-sub">(needs a bounce-back)</span></div>
          ${cold.length ? cold.map(g => `
            <div class="mc-gymnast-row" data-gymnast="${g.name}">
              ${photos[g.name] ? `<img src="${photos[g.name]}" class="mc-tiny-photo">` : '<div class="mc-tiny-photo-placeholder"></div>'}
              <span class="mc-gyname clickable-name" data-gymnast="${g.name}">${g.name}</span>
              <span class="mc-gystat">${g.recent.toFixed(3)}</span>
              <span class="mc-gydiff" style="color:#e74c3c">${g.diff.toFixed(3)}</span>
            </div>`).join('')
          : '<div class="mc-empty">No cold streaks — everyone showing up</div>'}
        </div>
      </div>`;

    // Animate the numbers
    setTimeout(() => {
      animateValue(document.getElementById('mcWins'), 0, wins, 800, 0);
      animateValue(document.getElementById('mcLosses'), 0, losses, 800, 0);
      if (teamAvg) animateValue(document.getElementById('mcAvg'), 390, teamAvg, 900, 2);
      if (homeAvg) animateValue(document.getElementById('mcHome'), 390, homeAvg, 900, 2);
      if (awayAvg) animateValue(document.getElementById('mcAway'), 390, awayAvg, 900, 2);
      if (seasonHigh) animateValue(document.getElementById('mcHigh'), 390, seasonHigh, 1000, 2);
    }, 100);
  }

  // ===== Hot Takes Generator =====
  function renderHotTakes() {
    const takes = [];

    const compDays = [];
    const seenD = new Set();
    meets.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(m => {
      if (seenD.has(m.date)) return; seenD.add(m.date);
      if (!m.stanfordScore || m.stanfordScore <= 0) return;
      compDays.push({ date: m.date, total: m.stanfordScore, isHome: m.isHome });
    });

    // 1. Record framing
    const wins = meets.filter(m=>m.result==='W').length;
    const losses = meets.filter(m=>m.result==='L').length;
    takes.push({
      icon: '📋', color: '#8C1515',
      title: 'Stanford Is Rolling',
      body: `The Cardinal are <strong>${wins}-${losses}</strong> this season. ${wins > losses ? `That's a ${((wins/(wins+losses))*100).toFixed(0)}% win rate — Stanford gymnastics is back.` : 'But the score trajectory tells the real story — they\'re getting better every meet.'}`
    });

    // 2. Home vs away
    const homeScores = compDays.filter(d=>d.isHome).map(d=>d.total);
    const awayScores = compDays.filter(d=>!d.isHome).map(d=>d.total);
    if (homeScores.length && awayScores.length) {
      const hAvg = mean(homeScores), aAvg = mean(awayScores);
      const diff = hAvg - aAvg;
      takes.push({
        icon: '🏠', color: '#2ecc71',
        title: diff > 0.5 ? 'Burnham Pavilion Is a Fortress' : diff > 0 ? 'Slight Home Edge' : 'Stanford Is Better on the Road',
        body: `Home average: <strong>${fmt(hAvg, 2)}</strong>. Away: <strong>${fmt(aAvg, 2)}</strong>. Difference: <strong>${diff>=0?'+':''}${fmt(diff, 2)}</strong>. ${diff > 1 ? 'The trees around Burnham are basically the 7th gymnast.' : diff > 0 ? 'A real but modest edge.' : 'Road warriors. The Cardinal travel well.'}`
      });
    }

    // 3. Class year leader
    const clsGroups = {};
    meets.forEach(m => {
      (m.athletes||[]).filter(a=>a.team==='Stanford').forEach(a => {
        const cls = bios[a.name]?.classYear; if (!cls) return;
        const scores = EVENTS.map(ev=>a.scores[ev]).filter(s=>s!==undefined&&s>0);
        if (!scores.length) return;
        if (!clsGroups[cls]) clsGroups[cls] = {scores:[],names:new Set()};
        scores.forEach(s=>clsGroups[cls].scores.push(s));
        clsGroups[cls].names.add(a.name);
      });
    });
    const clsRanked = Object.entries(clsGroups).map(([cls,g])=>({cls, avg: mean(g.scores), n: g.names.size})).filter(x=>x.avg).sort((a,b)=>b.avg-a.avg);
    if (clsRanked.length >= 2) {
      const top = clsRanked[0], bottom = clsRanked[clsRanked.length-1];
      const spread = top.avg - bottom.avg;
      takes.push({
        icon: '👨‍🎓', color: '#e67e22',
        title: `${top.cls}s Are Running This Team`,
        body: `By class year, <strong>${top.cls}s</strong> lead with a <strong>${fmt(top.avg)}</strong> event avg (${top.n} gymnasts). <strong>${bottom.cls}s</strong> trail at <strong>${fmt(bottom.avg)}</strong> — a <strong>${fmt(spread)}</strong> pt spread.`
      });
    }

    // 4. Hottest gymnast
    const allNames = [...new Set(meets.flatMap(m=>(m.athletes||[]).filter(a=>a.team==='Stanford').map(a=>a.name)))];
    function gymnLastAvg(name, n) {
      const scores = []; const seen = new Set();
      meets.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(m => {
        if (seen.size>=n||seen.has(m.date)||!m.athletes) return;
        const a = m.athletes.find(x=>x.name===name&&x.team==='Stanford');
        if (!a) return;
        const ev = EVENTS.map(e=>a.scores[e]).filter(s=>s!==undefined&&s>0);
        if (!ev.length) return;
        seen.add(m.date); ev.forEach(s=>scores.push(s));
      });
      return mean(scores);
    }
    function gymnSznAvg(name) {
      const scores = []; const seen = new Set();
      meets.forEach(m => {
        if (seen.has(m.date)||!m.athletes) return;
        const a = m.athletes.find(x=>x.name===name&&x.team==='Stanford');
        if (!a) return;
        const ev = EVENTS.map(e=>a.scores[e]).filter(s=>s!==undefined&&s>0);
        if (!ev.length) return;
        seen.add(m.date); ev.forEach(s=>scores.push(s));
      });
      return mean(scores);
    }
    const formList = allNames.map(name => {
      const last = gymnLastAvg(name, 3), season = gymnSznAvg(name);
      if (!last||!season) return null;
      return { name, last, season, diff: last-season };
    }).filter(Boolean).sort((a,b)=>b.diff-a.diff);

    if (formList[0] && formList[0].diff > 0.02) {
      const h = formList[0];
      takes.push({
        icon: '🔥', color: '#e74c3c',
        title: `${h.name.split(' ')[0]} Is the Hottest Gymnast Right Now`,
        body: `Over his last 3 meets, <strong class="clickable-name" data-gymnast="${h.name}">${h.name}</strong> is averaging <strong>${fmt(h.last)}</strong>/event — that's <strong>+${fmt(h.diff)}</strong> above his <strong>${fmt(h.season)}</strong> season average. Peak form heading into postseason.`
      });
    }

    // 5. Best specialist
    const specList = allNames.map(name => {
      const pos = bios[name]?.position;
      if (pos === 'All-Around') return null;
      if (!pos) return null;
      const season = gymnSznAvg(name);
      return season ? { name, pos, season } : null;
    }).filter(Boolean).sort((a,b)=>b.season-a.season);

    if (specList.length) {
      const topSpec = specList[0];
      takes.push({
        icon: '🎯', color: '#1abc9c',
        title: `Best Specialist: ${topSpec.name.split(' ')[0]}`,
        body: `<strong class="clickable-name" data-gymnast="${topSpec.name}">${topSpec.name}</strong> competes as a <strong>${topSpec.pos}</strong> specialist and is averaging <strong>${fmt(topSpec.season)}</strong>/event — laser focus on what he does best.`
      });
    }

    if (!takes.length) return '';

    return `
      <div class="takes-section">
        <h2 class="takes-title">🎙️ Hot Takes — Auto-Generated From The Data</h2>
        <p class="takes-subtitle">Every sentence below is computed live from the season stats.</p>
        <div class="takes-grid">
          ${takes.map(t => `
            <div class="take-card" style="border-left-color:${t.color}">
              <div class="take-icon">${t.icon}</div>
              <div class="take-body">
                <div class="take-title">${t.title}</div>
                <div class="take-text">${t.body}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ===== Gymnast Heat Map =====
  function renderHeatMap() {
    const ll = document.getElementById('leaderboardList');
    if (!ll) return;

    const gymnData = {};
    const seen = new Set();
    meets.forEach(m => {
      (m.athletes||[]).filter(a=>a.team==='Stanford').forEach(a => {
        if (!gymnData[a.name]) {
          gymnData[a.name] = {};
          EVENTS.forEach(ev => gymnData[a.name][ev] = []);
        }
        EVENTS.forEach(ev => {
          const s = a.scores[ev];
          if (s !== undefined && s > 0) {
            const key = `${a.name}|${ev}|${m.date}`;
            if (!seen.has(key)) { seen.add(key); gymnData[a.name][ev].push(s); }
          }
        });
      });
    });

    const teamAvgs = {};
    EVENTS.forEach(ev => {
      const all = Object.values(gymnData).flatMap(g=>g[ev]);
      teamAvgs[ev] = mcMean(all);
    });

    const gymnList = Object.entries(gymnData).map(([name, evDataMap]) => {
      const allScores = EVENTS.flatMap(ev=>evDataMap[ev]);
      const overallAvg = mcMean(allScores);
      const evAvgs = {};
      EVENTS.forEach(ev => { evAvgs[ev] = mcMean(evDataMap[ev]); });
      return { name, overallAvg, evAvgs };
    }).filter(g=>g.overallAvg).sort((a,b)=>b.overallAvg-a.overallAvg);

    function heatColor(val, teamAvg) {
      if (!val || !teamAvg) return '#E8E0D8';
      const diff = val - teamAvg;
      if (diff > 0.3) return 'rgba(46,204,113,0.55)';
      if (diff > 0.15) return 'rgba(46,204,113,0.35)';
      if (diff > 0.05) return 'rgba(46,204,113,0.18)';
      if (diff > -0.05) return 'rgba(255,255,255,0.06)';
      if (diff > -0.15) return 'rgba(231,76,60,0.2)';
      if (diff > -0.3) return 'rgba(231,76,60,0.35)';
      return 'rgba(231,76,60,0.55)';
    }

    ll.innerHTML = `
      <div class="heatmap-wrapper">
        <div class="heatmap-legend">
          <span>🟥 Below team avg</span>
          <span style="margin:0 1rem;">⬛ Near avg</span>
          <span>🟩 Above team avg</span>
          <span style="margin-left:1rem;color:#6B5744">Team avgs: ${EVENTS.map(ev=>`${EVENT_SHORT[ev]} ${teamAvgs[ev]!=null?teamAvgs[ev].toFixed(3):'—'}`).join(' • ')}</span>
        </div>
        <div class="heatmap-table-wrap">
          <table class="heatmap-table">
            <thead>
              <tr>
                <th class="hm-name">Gymnast</th>
                ${EVENTS.map(ev=>`<th>${EVENT_SHORT[ev]}</th>`).join('')}
                <th>OVERALL</th>
              </tr>
            </thead>
            <tbody>
              ${gymnList.map(g => `
                <tr>
                  <td class="hm-name">
                    ${photos[g.name]?`<img src="${photos[g.name]}" class="hm-photo">`:''}
                    <span class="clickable-name" data-gymnast="${g.name}">${g.name}</span>
                    ${bios[g.name]?.position&&bios[g.name].position!=='All-Around'?`<span class="hm-spec-badge">SPEC</span>`:''}
                  </td>
                  ${EVENTS.map(ev => {
                    const val = g.evAvgs[ev];
                    const bg = heatColor(val, teamAvgs[ev]);
                    const diff = val && teamAvgs[ev] ? val - teamAvgs[ev] : null;
                    return `<td class="hm-cell" style="background:${bg}" title="${val?val.toFixed(3):'—'} (${diff!=null?(diff>=0?'+':'')+diff.toFixed(3):'no data'} vs team)">
                      ${val ? val.toFixed(3) : '—'}
                      ${diff!=null?`<span class="hm-diff" style="color:${diff>=0?'#2ecc71':'#e74c3c'}">${diff>=0?'+':''}${diff.toFixed(3)}</span>`:''}
                    </td>`;
                  }).join('')}
                  <td class="hm-cell hm-overall">${g.overallAvg.toFixed(3)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ===== Season Overview =====
  function renderSeason() {
    document.getElementById('seasonRecord').innerHTML = '';
    renderMissionControl();
    renderScoreTrend();
    renderMeetCards();
  }

  function renderScoreTrend() {
    const container = document.getElementById('scoreTrend');
    const seenDates = new Set();
    const scoredMeets = meets.filter(m => {
      if (!m.stanfordScore || m.stanfordScore <= 0) return false;
      if (seenDates.has(m.date)) return false;
      seenDates.add(m.date);
      return true;
    });
    if (scoredMeets.length < 2) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Not enough data for trend chart</p>';
      return;
    }

    const w = 700, h = 180;
    const pad = { top: 20, right: 20, bottom: 35, left: 50 };
    const scores = scoredMeets.map(m => m.stanfordScore);
    const min = Math.min(...scores) - 2;
    const max = Math.max(...scores) + 2;
    const xScale = i => pad.left + (i / (scores.length - 1)) * (w - pad.left - pad.right);
    const yScale = v => pad.top + (1 - (v - min) / (max - min)) * (h - pad.top - pad.bottom);

    let pathD = scores.map((s, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(s).toFixed(1)}`).join(' ');

    let dots = scores.map((s, i) => {
      const meet = scoredMeets[i];
      const color = meet.result === 'W' ? '#2ecc71' : '#e74c3c';
      const isLive = meet.status === 'in_progress';
      return `<circle cx="${xScale(i).toFixed(1)}" cy="${yScale(s).toFixed(1)}" r="5" fill="${isLive ? '#ff4444' : color}" stroke="var(--dark)" stroke-width="2"${isLive ? ' class="live-dot"' : ''}>
        <title>${formatDate(meet.date)}: ${s.toFixed(2)} (${meet.result})${isLive ? ' 🔴 LIVE' : ''}</title>
      </circle>`;
    }).join('');

    const yTicks = 5;
    let yLabels = '';
    let yGridLines = '';
    for (let i = 0; i <= yTicks; i++) {
      const v = min + (i / yTicks) * (max - min);
      const y = yScale(v);
      yLabels += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="#6B5744" font-size="11" font-family="Inter">${v.toFixed(1)}</text>`;
      yGridLines += `<line x1="${pad.left}" y1="${y}" x2="${w - pad.right}" y2="${y}" stroke="#DDD5CC" stroke-width="0.5"/>`;
    }

    let xLabels = scoredMeets.map((m, i) => {
      const x = xScale(i);
      return `<text x="${x}" y="${h - 5}" text-anchor="middle" fill="#6B5744" font-size="9" font-family="Inter">${formatDate(m.date)}</text>`;
    }).join('');

    container.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
        ${yGridLines}
        <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
        ${dots}
        ${yLabels}
        ${xLabels}
      </svg>
    `;
  }

  function renderMeetCards() {
    const grid = document.getElementById('meetsGrid');
    const filtered = meets.filter(m => {
      if (currentFilter === 'all') return true;
      if (currentFilter === 'home') return m.isHome;
      if (currentFilter === 'away') return !m.isHome;
      return m.result === currentFilter;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p class="empty-text">No meets match this filter.</p></div>';
      return;
    }

    grid.innerHTML = filtered.map(m => renderMeetCard(m)).join('');

    requestAnimationFrame(() => {
      grid.querySelectorAll('.event-bar-fill').forEach(bar => {
        const w = bar.style.width;
        bar.style.width = '0%';
        requestAnimationFrame(() => { bar.style.width = w; });
      });
    });
  }

  function getStatusBadge(meet) {
    if (meet.status === 'in_progress') return '<span class="badge badge-live">🔴 LIVE</span>';
    if (meet.status === 'upcoming') return '<span class="badge badge-upcoming">UPCOMING</span>';
    return '';
  }

  function renderMeetCard(m) {
    const statusBadge = getStatusBadge(m);

    const mpData = meetPhotos[m.date];
    const mpThumb = mpData?.heroImage;

    if (m.status === 'upcoming') {
      return `
        <div class="meet-card" data-meet-id="${m.id}" style="overflow:hidden;">
          ${mpThumb ? `<div class="meet-card-thumb" style="position:relative;height:110px;overflow:hidden;border-radius:8px 8px 0 0;margin:-1rem -1rem 0.75rem -1rem;">
            <img src="${mpThumb}" alt="${m.opponent}" style="width:100%;height:100%;object-fit:cover;object-position:center center;" loading="lazy" onerror="this.parentElement.style.display='none'">
            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(16,14,11,0.95) 0%,rgba(16,14,11,0.1) 60%,transparent 100%)"></div>
          </div>` : ''}
          <div class="meet-header">
            <div>
              <div class="meet-opponent">${m.opponent}${m.isHome ? '<span class="badge badge-home">HOME</span>' : ''} ${statusBadge}</div>
              <div class="meet-date">${formatDateLong(m.date)}</div>
              <div class="meet-location">${m.location}</div>
            </div>
            <span class="badge badge-upcoming">UPCOMING</span>
          </div>
        </div>`;
    }

    const resultBadge = `<span class="badge badge-${m.result.toLowerCase()}">${m.result}</span>`;

    const eventBars = EVENTS.map(e => {
      if (!m.events || !m.events[e]) return '';
      const score = m.events[e].stanford;
      // Color tier based on men's per-event team scores (typical range 48–60)
      let pillClass = 'ep-avg';
      if (score >= 56)      pillClass = 'ep-great';
      else if (score >= 53) pillClass = 'ep-good';
      else if (score < 50)  pillClass = 'ep-low';
      return `<div class="event-pill ${pillClass}"><span class="ep-label">${EVENT_SHORT[e]}</span><span class="ep-score">${score.toFixed(2)}</span></div>`;
    }).join('');

    return `
      <div class="meet-card${m.status === 'in_progress' ? ' meet-card-live' : ''}" data-meet-id="${m.id}" style="overflow:hidden;">
        ${mpThumb ? `<div class="meet-card-thumb" style="position:relative;height:110px;overflow:hidden;border-radius:8px 8px 0 0;margin:-1rem -1rem 0.75rem -1rem;">
          <img src="${mpThumb}" alt="${m.opponent}" style="width:100%;height:100%;object-fit:cover;object-position:center center;" loading="lazy" onerror="this.parentElement.style.display='none'">
          <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(16,14,11,0.95) 0%,rgba(16,14,11,0.1) 60%,transparent 100%)"></div>
        </div>` : ''}
        <div class="meet-header">
          <div>
            <div class="meet-opponent">${m.opponent}${m.isHome ? '<span class="badge badge-home">HOME</span>' : ''} ${statusBadge}</div>
            <div class="meet-date">${formatDateLong(m.date)}</div>
            <div class="meet-location">${m.location}</div>
          </div>
          ${resultBadge}
        </div>
        <div class="meet-scores">
          <div class="team-score"><div class="team-name">STANFORD</div><div class="score score-stanford">${m.stanfordScore.toFixed(2)}</div></div>
          <div class="score-vs">vs</div>
          <div class="team-score"><div class="team-name">Opponent</div><div class="score">${m.opponentScore.toFixed(2)}</div></div>
        </div>
        <div class="event-pills-grid">${eventBars}</div>
      </div>`;
  }

  // ===== Meet Detail =====
  let _meetDetailOrigin = 'season';

  function renderMeetInsights(meet) {
    if (!meet.events || meet.status === 'upcoming') return '';
    const EV_LBL = {floor:'Floor',pommel:'Pommel',rings:'Rings',vault:'Vault',pbars:'P-Bars',hbar:'High Bar'};
    function mmean(arr) { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null; }
    function mfmt(n) { return typeof n==='number'&&!isNaN(n)?n.toFixed(2):'—'; }
    function mdiff(n) { if(typeof n!=='number'||isNaN(n)) return '—'; return (n>=0?'+':'')+n.toFixed(3); }

    const otherMeets = meets.filter(m => m.id !== meet.id && m.events);

    const teamSeasonAvg = {};
    EVENTS.forEach(ev => {
      const vals = otherMeets.filter(m=>m.events&&m.events[ev]).map(m=>m.events[ev].stanford);
      teamSeasonAvg[ev] = vals.length ? mmean(vals) : null;
    });

    const evPerf = EVENTS.map(ev => {
      const today = meet.events[ev]?.stanford;
      const avg = teamSeasonAvg[ev];
      const opp = meet.events[ev]?.opponent;
      if(today===undefined) return null;
      return {ev, today, avg, diff: avg!==null?today-avg:null, wonRot: today>opp, opp};
    }).filter(Boolean);

    // Game changers
    const gymnSeasonAvg = {};
    (meet.athletes||[]).filter(a=>a.team==='Stanford').forEach(a => {
      gymnSeasonAvg[a.name] = {};
      EVENTS.forEach(ev => {
        const vals = [];
        otherMeets.forEach(om => {
          const oa = (om.athletes||[]).find(x=>x.name===a.name);
          if(oa&&oa.scores[ev]!==undefined) vals.push(oa.scores[ev]);
        });
        gymnSeasonAvg[a.name][ev] = vals.length ? mmean(vals) : null;
      });
    });

    const gameChangers = [];
    (meet.athletes||[]).filter(a=>a.team==='Stanford').forEach(a => {
      EVENTS.forEach(ev => {
        const today = a.scores[ev];
        const avg = gymnSeasonAvg[a.name]?.[ev];
        if(today!==undefined && avg!==null && avg!==undefined) {
          gameChangers.push({name:a.name, ev, today, avg, delta:today-avg});
        }
      });
    });
    gameChangers.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));

    const heroes = gameChangers.filter(g=>g.delta>0).slice(0,3);
    const evWon = evPerf.filter(e=>e.wonRot).length;
    const evLost = evPerf.filter(e=>!e.wonRot).length;
    const aboveAvg = evPerf.filter(e=>e.diff!==null&&e.diff>0).length;

    const headlines = [
      aboveAvg > 0 ? `<div class="insight-headline">📊 Stanford scored above season avg in <strong>${aboveAvg} of ${evPerf.length}</strong> events</div>` : '',
      heroes[0] ? `<div class="insight-headline">🔥 <strong>${heroes[0].name}</strong> was the standout — <strong>${mdiff(heroes[0].delta)}</strong> above ${EV_LBL[heroes[0].ev]} avg</div>` : '',
      `<div class="insight-headline">${evWon > evLost ? '✅' : '❌'} Stanford <strong>won ${evWon}</strong> rotation${evWon!==1?'s':''}, lost <strong>${evLost}</strong></div>`,
    ].filter(Boolean).join('');

    const evCards = evPerf.map(e => {
      const aboveAvg = e.diff!==null && e.diff>0;
      const bg = e.wonRot
        ? (aboveAvg ? 'linear-gradient(135deg,#1a6b3e,#27a060)' : 'linear-gradient(135deg,#2a6496,#3a86c8)')
        : (aboveAvg ? 'linear-gradient(135deg,#7a5a10,#c9920a)' : 'linear-gradient(135deg,#6b1515,#8C1515)');
      const badgeTxt = e.wonRot ? 'WON' : 'LOST';
      return `
        <div class="ev-perf-card" style="background:${bg}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="ev-pc-event">${EV_LBL[e.ev]}</span>
            <span class="ev-pc-badge">${badgeTxt}</span>
          </div>
          <div class="ev-pc-score">${mfmt(e.today)}</div>
          <div class="ev-pc-delta" style="opacity:${e.diff===null?0.5:0.8}">${e.diff!==null?mdiff(e.diff):'no baseline'} vs avg</div>
          <div class="ev-pc-opp">opp: ${mfmt(e.opp)}</div>
        </div>`;
    }).join('');

    const gcCards = gameChangers.slice(0,6).map(g => {
      const borderColor = g.delta>0.02?'#2ecc71':g.delta<-0.02?'#e74c3c':'#888';
      const pillBg = g.delta>0.02?'rgba(46,204,113,0.15)':g.delta<-0.02?'rgba(231,76,60,0.15)':'rgba(136,136,136,0.12)';
      const pillColor = g.delta>0.02?'#1a9a5a':g.delta<-0.02?'#c0392b':'#666';
      return `
        <div class="gc-card" style="border-left:3px solid ${borderColor}">
          <div class="gc-left">
            <span class="gc-name clickable-name" data-gymnast="${g.name}">${g.name}</span>
            <span class="gc-event">${EV_LBL[g.ev]}</span>
          </div>
          <div class="gc-right">
            <span class="gc-score">${mfmt(g.today)}</span>
            <span class="gc-delta-pill" style="background:${pillBg};color:${pillColor}">${mdiff(g.delta)}</span>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="section-card meet-insights-card">
        <h2 class="section-title">📊 Meet Analysis</h2>
        <div class="mi-headlines">${headlines}</div>
        <div class="mi-subtitle" style="padding:0 16px;margin-top:8px">Event Performance vs Season Avg</div>
        <div class="ev-perf-grid">${evCards}</div>
        <div class="mi-subtitle" style="padding:0 16px;margin-top:12px">Game Changers (vs personal avg)</div>
        <div class="gc-grid">${gcCards}</div>
      </div>`;
  }

  function showMeetDetail(meetId) {
    _meetDetailOrigin = currentView;
    const meet = meets.find(m => m.id === meetId);
    if (!meet) return;

    scrollToTop();
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const view = document.getElementById('view-meet');
    view.style.display = 'block';

    const content = document.getElementById('meetDetailContent');

    if (meet.status === 'upcoming') {
      content.innerHTML = `
        <div class="detail-hero">
          <div class="meet-header">
            <div>
              <div class="meet-opponent" style="font-size:1.5rem;">vs ${meet.opponent}</div>
              <div class="meet-date">${formatDateLong(meet.date)}</div>
              <div class="meet-location">${meet.location}</div>
            </div>
            <span class="badge badge-upcoming" style="font-size:1rem;padding:0.3rem 0.8rem;">UPCOMING</span>
          </div>
        </div>`;
      return;
    }

    // Event detail cards
    const eventCards = EVENTS.map(event => {
      if (!meet.events || !meet.events[event]) return '';
      const stanScore = meet.events[event].stanford;
      const oppScore = meet.events[event].opponent;
      const barPct = ((stanScore / 72) * 100).toFixed(1);

      const eventAthletes = (meet.athletes||[])
        .filter(a => a.scores[event] !== undefined && a.team === 'Stanford')
        .sort((a,b) => b.scores[event] - a.scores[event]);

      const rows = eventAthletes.map((a, i) => `
        <tr class="lineup-row">
          <td>${i + 1}</td>
          <td style="display:flex;align-items:center;gap:0.4rem;">
            ${photos[a.name] ? `<img src="${photos[a.name]}" class="mc-tiny-photo">` : '<div class="mc-tiny-photo-placeholder"></div>'}
            <span class="clickable-name" data-gymnast="${a.name}">${a.name}</span>
          </td>
          <td class="score-cell">${a.scores[event].toFixed(3)}</td>
        </tr>`).join('');

      return `
        <div class="detail-event-card">
          <div class="dec-top">
            <div class="detail-event-title">${EVENT_NAMES[event]}</div>
            <div class="dec-score-row">
              <span class="dec-score">${stanScore.toFixed(2)}</span>
              <span class="dec-opp">vs ${oppScore.toFixed(2)}</span>
            </div>
          </div>
          <div class="event-bar-track" style="margin-bottom:0.75rem;">
            <div class="event-bar-fill" style="width:${barPct}%"></div>
          </div>
          <table class="lineup-table">
            <thead><tr><th>#</th><th>Athlete</th><th style="text-align:right">Score</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="3" style="color:var(--text-muted)">No data</td></tr>'}</tbody>
          </table>
        </div>`;
    }).join('');

    const resultBadge = `<span class="badge badge-${meet.result.toLowerCase()}" style="font-size:1rem;padding:0.3rem 0.8rem;">${meet.result}</span>`;

    const mpData = meetPhotos[meet.date];
    const heroImg = mpData?.heroImage;

    content.innerHTML = `
      ${heroImg ? `<div class="meet-hero-photo" style="position:relative;width:100%;height:220px;overflow:hidden;border-radius:12px;margin-bottom:1rem;">
        <img src="${heroImg}" alt="${meet.opponent} meet" style="width:100%;height:100%;object-fit:cover;object-position:center center;" loading="lazy" onerror="this.parentElement.style.display='none'">
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 50%)"></div>
        <div style="position:absolute;bottom:0.75rem;left:1rem;right:1rem;display:flex;justify-content:space-between;align-items:flex-end;">
          <span style="color:#fff;font-family:Oswald;font-size:1.1rem;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.8)">vs ${meet.opponent}</span>
          ${mpData?.recapUrl ? `<a href="${mpData.recapUrl}" target="_blank" style="color:rgba(255,255,255,0.75);font-size:0.72rem;text-decoration:none;background:rgba(0,0,0,0.4);padding:0.2rem 0.5rem;border-radius:4px">gostanford.com →</a>` : ''}
        </div>
      </div>` : ''}
      <div class="detail-hero">
        <div class="meet-header">
          <div>
            <div class="meet-opponent" style="font-size:1.5rem;">vs ${meet.opponent}</div>
            <div class="meet-date">${formatDateLong(meet.date)}</div>
            <div class="meet-location">${meet.location}</div>
          </div>
          ${resultBadge}
        </div>
        <div class="meet-scores" style="margin-top:1rem;">
          <div class="team-score"><div class="team-name">STANFORD</div><div class="score score-stanford" style="font-size:2rem;">${meet.stanfordScore.toFixed(2)}</div></div>
          <div class="score-vs">vs</div>
          <div class="team-score"><div class="team-name">Opponent</div><div class="score" style="font-size:2rem;">${meet.opponentScore.toFixed(2)}</div></div>
        </div>
      </div>
      ${(()=>{try{return renderMeetInsights(meet);}catch(e){return '';}})()}
      <h2 class="section-title" style="margin-bottom:1rem;">Event Breakdown</h2>
      <div class="detail-event-grid">${eventCards}</div>
    `;
  }

  // ===== Gymnasts =====
  function getGymnastProfiles() {
    const profiles = {};
    meets.forEach(meet => {
      (meet.athletes||[]).filter(a=>a.team==='Stanford').forEach(a => {
        if (!profiles[a.name]) {
          profiles[a.name] = { name: a.name, meets: [], events: new Set() };
        }
        const entry = { meetId: meet.id, date: meet.date, opponent: meet.opponent, isHome: meet.isHome, scores: { ...a.scores } };
        profiles[a.name].meets.push(entry);
        Object.keys(a.scores).forEach(e => {
          if (e !== 'aa') profiles[a.name].events.add(e);
        });
      });
    });

    Object.values(profiles).forEach(p => {
      p.averages = {};
      p.bests = {};
      p.eventsList = Array.from(p.events);

      [...EVENTS, 'aa'].forEach(event => {
        const scores = p.meets
          .filter(m => m.scores[event] !== undefined)
          .map(m => m.scores[event]);
        if (scores.length > 0) {
          p.averages[event] = scores.reduce((a, b) => a + b, 0) / scores.length;
          p.bests[event] = Math.max(...scores);
        }
      });

      p.totalMeets = new Set(p.meets.map(m => m.date)).size;
    });

    return Object.values(profiles).sort((a, b) => b.totalMeets - a.totalMeets);
  }

  function renderGymnasts(searchTerm = '') {
    const profiles = getGymnastProfiles();

    const profileNames = new Set(profiles.map(p => p.name));
    const bioOnlyCards = Object.keys(bios)
      .filter(name => !profileNames.has(name))
      .map(name => ({ name, bioOnly: true }));

    const allCards = [...profiles, ...bioOnlyCards];
    const filtered = searchTerm
      ? allCards.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : allCards;

    const detail = document.getElementById('gymnastDetail');
    detail.style.display = 'none';

    const container = document.getElementById('gymnastCards');
    container.style.display = 'grid';

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p class="empty-text">No gymnasts found.</p></div>';
      return;
    }

    container.innerHTML = filtered.map(p => {
      const photo = photos[p.name];
      const photoHtml = photo
        ? `<img src="${photo}" class="gymnast-headshot" alt="${p.name}" loading="lazy">`
        : `<div class="gymnast-headshot-placeholder">${p.name.split(' ').map(n=>n[0]).join('')}</div>`;

      if (p.bioOnly) {
        const bio = bios[p.name] || {};
        const pos = bio.position ? `<span class="event-badge" style="background:var(--cardinal);color:#fff">${bio.position}</span>` : '';
        const yr = bio.classYear ? `<span class="event-badge">${bio.classYear}</span>` : '';
        return `
          <div class="gymnast-card" data-gymnast="${p.name}" style="opacity:0.75">
            ${photoHtml}
            <div class="gymnast-name">${p.name}</div>
            <div class="gymnast-events">${pos}${yr}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">Did not compete</div>
            <div class="gymnast-averages" style="font-size:0.7rem;color:var(--text-muted)">${bio.hometown ? '📍 ' + bio.hometown : ''}</div>
          </div>`;
      }

      const eventBadges = p.eventsList.map(e => `<span class="event-badge">${EVENT_SHORT[e]}</span>`).join('');
      const avgStats = p.eventsList.map(e => {
        if (!p.averages[e]) return '';
        return `<div class="avg-stat"><div class="avg-value">${p.averages[e].toFixed(3)}</div><div class="avg-label">${EVENT_SHORT[e]}</div></div>`;
      }).join('');

      return `
        <div class="gymnast-card" data-gymnast="${p.name}">
          ${photoHtml}
          <div class="gymnast-name">${p.name}</div>
          <div class="gymnast-events">${eventBadges}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">${p.totalMeets} competition days</div>
          <div class="gymnast-averages">${avgStats}</div>
        </div>`;
    }).join('');
  }

  function showGymnastProfile(name) {
    scrollToTop();
    const profiles = getGymnastProfiles();
    const p = profiles.find(pr => pr.name === name);

    if (!p && bios[name]) {
      document.getElementById('gymnastCards').style.display = 'none';
      const detail = document.getElementById('gymnastDetail');
      detail.style.display = 'block';
      const bio = bios[name];
      const photo = photos[name];
      const photoHtml = photo
        ? `<img src="${photo}" class="profile-photo" alt="${name}" loading="lazy">`
        : `<div class="gymnast-headshot-placeholder" style="width:80px;height:80px;font-size:1.5rem;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#8C1515;color:#fff;margin:0 auto 1rem;">${name.split(' ').map(n=>n[0]).join('')}</div>`;
      const pills = [
        bio.position ? `<span style="background:#8C1515;color:#fff;padding:0.2rem 0.7rem;border-radius:999px;font-size:0.75rem;font-weight:700">${bio.position}</span>` : '',
        bio.classYear ? `<span style="background:#E8E0D8;color:#6B5744;padding:0.2rem 0.7rem;border-radius:999px;font-size:0.75rem">${bio.classYear}</span>` : '',
        bio.hometown ? `<span style="background:#E8E0D8;color:#6B5744;padding:0.2rem 0.7rem;border-radius:999px;font-size:0.75rem">📍 ${bio.hometown}</span>` : '',
      ].filter(Boolean).join(' ');
      detail.innerHTML = `
        <button class="back-btn" id="backFromBioOnly">← Back to Roster</button>
        <div class="gymnast-profile-header">
          ${photoHtml}
          <div>
            <h2 class="profile-name">${name}</h2>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.5rem">${pills}</div>
            <div style="margin-top:0.75rem;color:#6B5744;font-size:0.85rem">⚠️ Did not appear in 2026 season competition data.</div>
            ${bio.major ? `<div style="margin-top:0.5rem;color:#6B5744;font-size:0.8rem">🎓 ${bio.major}</div>` : ''}
          </div>
        </div>`;
      document.getElementById('backFromBioOnly').addEventListener('click', () => {
        detail.style.display = 'none';
        document.getElementById('gymnastCards').style.display = 'grid';
      });
      return;
    }

    if (!p) return;

    document.getElementById('gymnastCards').style.display = 'none';
    const detail = document.getElementById('gymnastDetail');
    detail.style.display = 'block';

    // Stats grid
    const statsGrid = EVENTS.map(event => {
      if (!p.averages[event]) return '';
      return `
        <div class="profile-stat">
          <div class="stat-value" style="color:var(--accent)">${p.averages[event].toFixed(3)}</div>
          <div class="stat-label">${EVENT_NAMES[event]} Avg</div>
        </div>
        <div class="profile-stat">
          <div class="stat-value">${p.bests[event].toFixed(3)}</div>
          <div class="stat-label">${EVENT_NAMES[event]} Best</div>
        </div>`;
    }).join('');

    // Sparklines per event
    const sparklines = EVENTS.map(event => {
      const eventMeets = p.meets.filter(m => m.scores[event] !== undefined);
      if (eventMeets.length < 2) return '';
      const scores = eventMeets.map(m => m.scores[event]);
      return `
        <div class="sparkline-section">
          <div class="sparkline-title">${EVENT_NAMES[event]} Trend</div>
          <div class="sparkline-container">${createSparkline(scores, eventMeets.map(m => formatDate(m.date)))}</div>
        </div>`;
    }).join('');

    // Meet history table
    const historyRows = p.meets.map(m => {
      const cells = EVENTS.map(e => {
        if (m.scores[e] === undefined) return '<td style="color:var(--text-muted)">—</td>';
        const isBest = p.bests[e] === m.scores[e];
        return `<td class="${isBest ? 'personal-best' : ''}">${m.scores[e].toFixed(3)}${isBest ? ' ★' : ''}</td>`;
      }).join('');
      const aa = m.scores.aa ? `<td>${m.scores.aa.toFixed(3)}</td>` : '<td style="color:var(--text-muted)">—</td>';
      const haBadge = m.isHome ? '<span class="badge badge-home" style="font-size:0.65rem;padding:0.1rem 0.4rem;margin-left:0.3rem;">H</span>' : '<span class="badge" style="font-size:0.65rem;padding:0.1rem 0.4rem;margin-left:0.3rem;background:#E8E0D8;color:#6B5744;">A</span>';
      return `<tr><td>${formatDate(m.date)}</td><td><span class="clickable-meet" data-meet-id="${m.meetId}">${m.opponent}</span>${haBadge}</td>${cells}${aa}</tr>`;
    }).join('');

    // Hero card
    const gymnPhoto = photos[p.name];
    const pb = bios[p.name]||{};
    const heroPills = [];
    if(pb.position) heroPills.push(`<span style="background:#8C1515;color:#fff;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.75rem;font-weight:700;letter-spacing:0.03em">${pb.position}</span>`);
    if(pb.classYear) heroPills.push(`<span style="background:#E8E0D8;color:#6B5744;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.75rem;font-weight:600">${pb.classYear}</span>`);

    const heroInfoRows = [];
    if(pb.hometown) heroInfoRows.push(`<div style="color:rgba(255,255,255,0.7);font-size:0.85rem">📍 ${pb.hometown}</div>`);
    if(pb.height) heroInfoRows.push(`<div style="color:rgba(255,255,255,0.7);font-size:0.85rem">📏 ${pb.height}</div>`);
    if(pb.major) heroInfoRows.push(`<div style="color:rgba(255,255,255,0.7);font-size:0.85rem">🎓 ${pb.major}</div>`);

    const heroStatEvents = EVENTS.filter(e => p.bests[e] !== undefined);
    const heroStatsHtml = heroStatEvents.length ? `
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.75rem">
        ${heroStatEvents.map(e => `
          <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:0.35rem 0.6rem;text-align:center;min-width:60px">
            <div style="font-size:0.6rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.05em;font-weight:600">${EVENT_SHORT[e]}</div>
            <div style="font-size:0.95rem;font-weight:700;color:#fff;font-family:Oswald">${p.bests[e].toFixed(3)}</div>
          </div>`).join('')}
        ${p.bests.aa !== undefined ? `
          <div style="background:rgba(140,21,21,0.15);border:1px solid rgba(140,21,21,0.3);border-radius:6px;padding:0.35rem 0.6rem;text-align:center;min-width:60px">
            <div style="font-size:0.6rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.05em;font-weight:600">AA</div>
            <div style="font-size:0.95rem;font-weight:700;color:#fff;font-family:Oswald">${p.bests.aa.toFixed(3)}</div>
          </div>` : ''}
      </div>` : '';

    const heroCardHtml = `
      <div class="athlete-hero-card" style="display:flex;gap:1.5rem;padding:1.25rem;background:linear-gradient(135deg,#8C1515 0%,#6b1010 100%);border-radius:12px;border:1px solid rgba(140,21,21,0.2);align-items:flex-start">
        ${gymnPhoto ? `
        <div style="flex-shrink:0;width:200px;height:280px;border-radius:10px;overflow:hidden;box-shadow:0 8px 24px rgba(140,21,21,0.3),0 0 0 1px rgba(255,255,255,0.2)">
          <img src="${gymnPhoto}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;object-position:center;" loading="lazy">
        </div>` : ''}
        <div style="flex:1;display:flex;flex-direction:column;justify-content:center;min-height:${gymnPhoto ? '280px' : 'auto'};padding:0.25rem 0">
          <div style="font-family:Oswald;font-size:2rem;font-weight:700;color:#fff;line-height:1.1;letter-spacing:0.01em">${p.name}</div>
          <div style="color:rgba(255,255,255,0.7);font-size:0.8rem;margin-top:0.3rem;font-weight:500;text-transform:uppercase;letter-spacing:0.08em">Stanford Men's Gymnastics</div>
          ${heroPills.length ? `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.6rem;align-items:center">${heroPills.join('')}</div>` : ''}
          ${heroInfoRows.length ? `<div style="display:flex;flex-direction:column;gap:0.25rem;margin-top:0.75rem">${heroInfoRows.join('')}</div>` : ''}
          <div style="color:rgba(255,255,255,0.7);font-size:0.8rem;margin-top:0.6rem;border-top:1px solid rgba(255,255,255,0.2);padding-top:0.6rem">${p.totalMeets} competition days</div>
          ${heroStatsHtml}
        </div>
      </div>`;

    // Gymnast insights
    const insightsHtml = renderGymnastInsights(p.name);

    // Gymnast wild stats
    const wildStatsHtml = renderGymnastWildStats(p.name);

    detail.innerHTML = `
      <div class="gymnast-profile">
        <button class="back-btn" id="backToGymnasts">← Back to Gymnasts</button>
        ${heroCardHtml}
        <div class="profile-header" style="margin-top:0.75rem">
          <div class="profile-stats-grid">${statsGrid}</div>
        </div>
        ${sparklines}
        ${insightsHtml}
        ${wildStatsHtml}
        <div class="section-card">
          <h2 class="section-title">Meet History</h2>
          <div style="overflow-x:auto;">
            <table class="meet-history-table">
              <thead><tr><th>Date</th><th>Opponent</th>${EVENTS.map(e=>`<th>${EVENT_SHORT[e]}</th>`).join('')}<th>AA</th></tr></thead>
              <tbody>${historyRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    document.getElementById('backToGymnasts').addEventListener('click', () => {
      detail.style.display = 'none';
      document.getElementById('gymnastCards').style.display = 'grid';
    });
  }

  // ===== Gymnast Insights =====
  function renderGymnastInsights(name) {
    const EV_LBL = {floor:'Floor',pommel:'Pommel',rings:'Rings',vault:'Vault',pbars:'P-Bars',hbar:'High Bar'};
    function gmean(arr) { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0; }
    function gsd(arr) {
      if (arr.length < 2) return null;
      const m = gmean(arr);
      return Math.sqrt(arr.reduce((s,v)=>s+Math.pow(v-m,2),0)/(arr.length-1));
    }
    function glinReg(pts) {
      const n=pts.length; if(n<2) return {slope:0};
      const sx=pts.reduce((s,p)=>s+p.x,0), sy=pts.reduce((s,p)=>s+p.y,0);
      const sxy=pts.reduce((s,p)=>s+p.x*p.y,0), sx2=pts.reduce((s,p)=>s+p.x*p.x,0);
      return {slope:(n*sxy-sx*sy)/(n*sx2-sx*sx)||0};
    }
    function gfmt(n) { return typeof n==='number'&&!isNaN(n)?n.toFixed(3):'—'; }
    function gdiff(n) { if(typeof n!=='number'||isNaN(n)) return '—'; return (n>=0?'+':'')+n.toFixed(3); }
    function arrow(s) {
      if(s===null) return '<span style="color:#9B8A7A">—</span>';
      if(s>0.015) return '<span style="color:#2ecc71">▲</span>';
      if(s<-0.015) return '<span style="color:#e74c3c">▼</span>';
      return '<span style="color:#9B8A7A">►</span>';
    }

    const sm = meets.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    if (!sm.length) return '';
    const t0 = new Date(sm[0].date+'T12:00:00');

    function evEntries(ev) {
      const out=[], seen=new Set();
      sm.forEach(meet => {
        if(seen.has(meet.date)||!meet.athletes) return;
        const a=meet.athletes.find(x=>x.name===name&&x.team==='Stanford');
        if(a&&a.scores[ev]!==undefined){
          seen.add(meet.date);
          out.push({
            score:a.scores[ev], date:meet.date, isHome:meet.isHome,
            result:meet.result, gap:Math.abs((meet.stanfordScore||0)-(meet.opponentScore||0)),
            day:Math.round((new Date(meet.date+'T12:00:00')-t0)/864e5)
          });
        }
      });
      return out;
    }

    const evStats = EVENTS.map(ev => {
      const e = evEntries(ev);
      if(e.length<2) return null;
      const scores = e.map(x=>x.score);
      const slope = e.length>=3 ? glinReg(e.map(x=>({x:x.day,y:x.score}))).slope*7 : null;
      const home=e.filter(x=>x.isHome).map(x=>x.score);
      const away=e.filter(x=>!x.isHome).map(x=>x.score);
      const wins=e.filter(x=>x.result==='W').map(x=>x.score);
      const losses=e.filter(x=>x.result==='L').map(x=>x.score);
      return {
        ev, n:e.length, avg:gmean(scores), best:Math.max(...scores), sd:gsd(scores), slope,
        homeAvg:home.length?gmean(home):null, awayAvg:away.length?gmean(away):null,
        haDiff:home.length&&away.length?gmean(home)-gmean(away):null,
        winAvg:wins.length?gmean(wins):null, lossAvg:losses.length?gmean(losses):null,
        wlDiff:wins.length&&losses.length?gmean(wins)-gmean(losses):null,
      };
    }).filter(Boolean);

    if(evStats.length===0) return '';

    const sorted = evStats.slice().sort((a,b)=>b.avg-a.avg);
    const mostConsistent = evStats.filter(e=>e.sd!==null).sort((a,b)=>a.sd-b.sd)[0];
    const bestTrend = evStats.filter(e=>e.slope!==null).sort((a,b)=>b.slope-a.slope)[0];

    const headlines = [
      sorted[0] ? `<div class="insight-headline">🏅 Strongest event: <strong>${EV_LBL[sorted[0].ev]}</strong> — season avg <strong>${gfmt(sorted[0].avg)}</strong></div>` : '',
      mostConsistent&&evStats.length>1 ? `<div class="insight-headline">🎯 Most consistent on <strong>${EV_LBL[mostConsistent.ev]}</strong> — std dev <strong>${mostConsistent.sd.toFixed(3)}</strong></div>` : '',
      bestTrend&&bestTrend.slope>0.01 ? `<div class="insight-headline">📈 Trending up on <strong>${EV_LBL[bestTrend.ev]}</strong> — <strong>+${bestTrend.slope.toFixed(3)}</strong> pts/week</div>` : '',
    ].filter(Boolean).join('');

    // Team averages per event for comparison
    const teamAvg = {};
    EVENTS.forEach(ev => {
      const all = [];
      meets.forEach(m => (m.athletes||[]).filter(a=>a.team==='Stanford'&&a.scores[ev]!==undefined).forEach(a=>all.push(a.scores[ev])));
      teamAvg[ev] = all.length ? gmean(all) : null;
    });

    const cards = evStats.map(e => {
      const SCORE_MIN = 13.0, SCORE_MAX = 15.0;
      const barPct = Math.round(Math.max(0,Math.min(100,((e.avg-SCORE_MIN)/(SCORE_MAX-SCORE_MIN))*100)));
      const vTeam = teamAvg[e.ev];
      const vsDiff = vTeam ? e.avg - vTeam : null;
      return `
      <div class="gi-ev-card">
        <div class="gi-ev-title">${EV_LBL[e.ev]} <span class="gi-n">${e.n} meets</span></div>
        <div class="gi-score-display">
          <span class="gi-big-avg">${gfmt(e.avg)}</span>
          ${vsDiff!==null?`<span class="gi-vs-team" style="color:${vsDiff>0?'#2ecc71':vsDiff<0?'#e74c3c':'#aaa'}">${gdiff(vsDiff)} vs team</span>`:''}
        </div>
        <div class="gi-gauge-wrap"><div class="gi-gauge-bar" style="width:${barPct}%"></div></div>
        <div class="gi-divider"></div>
        <div class="gi-row"><span>Best</span><span>${gfmt(e.best)}</span></div>
        ${e.sd!==null?`<div class="gi-row"><span>Consistency</span><span>${e.sd.toFixed(3)} SD</span></div>`:''}
        ${e.slope!==null?`<div class="gi-row"><span>Trend</span><span>${arrow(e.slope)} ${e.slope>=0?'+':''}${e.slope.toFixed(3)}/wk</span></div>`:''}
        ${e.haDiff!==null?`<div class="gi-row"><span>Home/Away Δ</span><span style="color:${e.haDiff>0?'#2ecc71':e.haDiff<0?'#e74c3c':'#aaa'}">${gdiff(e.haDiff)}</span></div>`:''}
        ${e.wlDiff!==null?`<div class="gi-row"><span>Win/Loss Δ</span><span style="color:${e.wlDiff>0?'#2ecc71':e.wlDiff<0?'#e74c3c':'#aaa'}">${gdiff(e.wlDiff)}</span></div>`:''}
      </div>`;
    }).join('');

    return `
      <div class="section-card" style="margin-bottom:1rem">
        <h2 class="section-title">📊 Personal Insights</h2>
        ${headlines?`<div class="insight-headlines" style="margin-bottom:1rem">${headlines}</div>`:''}
        <div class="gi-ev-grid">${cards}</div>
      </div>`;
  }

  // ===== Gymnast Wild Stats =====
  function renderGymnastWildStats(name) {
    const gymnBio = bios[name];
    if (!gymnBio) return '';

    const items = [];

    if (gymnBio.classYear) {
      const classEmoji = {Freshman:'🐣',Sophomore:'📚',Junior:'🎯',Senior:'👑',Graduate:'🎓'}[gymnBio.classYear]||'🎓';
      items.push(`${classEmoji} <strong>${gymnBio.classYear}</strong> from ${gymnBio.hometown||'unknown'}.`);
    }

    if (gymnBio.major) {
      items.push(`🎓 Studies <strong>${gymnBio.major}</strong>.`);
    }

    if (gymnBio.funFact) {
      items.push(`⭐ ${gymnBio.funFact}`);
    }

    if (gymnBio.height) {
      items.push(`📏 Height: ${gymnBio.height}`);
    }

    if (items.length === 0) return '';

    return `
      <div class="section-card wild-card">
        <h2 class="section-title">🎲 Fun Facts</h2>
        <div class="wild-grid">
          ${items.map(item=>`<div class="wild-item">${item}</div>`).join('')}
        </div>
      </div>`;
  }

  function createSparkline(scores, labels) {
    const w = 400, h = 70;
    const pad = { top: 10, right: 10, bottom: 20, left: 10 };
    const min = Math.min(...scores) - 0.05;
    const max = Math.max(...scores) + 0.05;
    const xScale = i => pad.left + (i / (scores.length - 1)) * (w - pad.left - pad.right);
    const yScale = v => pad.top + (1 - (v - min) / (max - min)) * (h - pad.top - pad.bottom);

    const pathD = scores.map((s, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(s).toFixed(1)}`).join(' ');

    const dots = scores.map((s, i) => `
      <circle cx="${xScale(i).toFixed(1)}" cy="${yScale(s).toFixed(1)}" r="4" fill="var(--accent)" stroke="var(--dark)" stroke-width="2">
        <title>${labels[i]}: ${s.toFixed(3)}</title>
      </circle>`).join('');

    const xLabels = scores.map((s, i) => `
      <text x="${xScale(i).toFixed(1)}" y="${h - 2}" text-anchor="middle" fill="#6B5744" font-size="8" font-family="Inter">${labels[i]}</text>`).join('');

    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
      <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2" opacity="0.6"/>
      ${dots}
      ${xLabels}
    </svg>`;
  }

  // ===== Leaderboards =====
  function renderLeaderboard(event) {
    document.querySelectorAll('.event-tab').forEach(t => t.classList.toggle('active', t.dataset.event === event));

    if (event === 'heatmap') { renderHeatMap(); return; }

    // AA: compute all-around for gymnasts with all 6 events in a meet
    const byGymnast = {};
    const sortedMeets = meets.slice().sort((a, b) => new Date(a.date) - new Date(b.date));

    if (event === 'aa') {
      sortedMeets.forEach(meet => {
        (meet.athletes||[]).filter(a=>a.team==='Stanford').forEach(a => {
          const evScores = EVENTS.map(ev => a.scores[ev]).filter(s => s !== undefined && s > 0);
          if (evScores.length >= 4) { // count as AA if at least 4 events
            const aaScore = evScores.reduce((s,v)=>s+v,0);
            if (!byGymnast[a.name]) byGymnast[a.name] = [];
            byGymnast[a.name].push({ score: aaScore, meetDate: meet.date, opponent: meet.opponent, meetId: meet.id });
          }
        });
      });
    } else {
      sortedMeets.forEach(meet => {
        (meet.athletes||[]).filter(a=>a.team==='Stanford').forEach(a => {
          if (a.scores[event] !== undefined) {
            if (!byGymnast[a.name]) byGymnast[a.name] = [];
            byGymnast[a.name].push({ score: a.scores[event], meetDate: meet.date, opponent: meet.opponent, meetId: meet.id });
          }
        });
      });
    }

    const gymnasts = Object.entries(byGymnast).map(([name, entries]) => {
      const scores = entries.map(e => e.score);
      const best = entries.reduce((a, b) => a.score > b.score ? a : b);
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
      const recent = entries[entries.length - 1];
      return { name, best, avg, recent, count: scores.length };
    });

    gymnasts.sort((a, b) => b.best.score - a.best.score);

    const list = document.getElementById('leaderboardList');
    if (gymnasts.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p class="empty-text">No scores available for this event.</p></div>';
      return;
    }

    list.innerHTML = gymnasts.map((g, i) => {
      const photo = photos[g.name];
      const avatar = photo
        ? `<img src="${photo}" class="lb-avatar" alt="${g.name}">`
        : `<div class="lb-avatar lb-avatar-initials">${g.name.split(' ').map(n => n[0]).join('')}</div>`;
      const dp = event === 'aa' ? 2 : 3;
      return `
      <div class="leaderboard-item">
        <div class="lb-rank ${i < 3 ? 'top-3' : ''}">${i + 1}</div>
        ${avatar}
        <div class="lb-info">
          <div class="lb-name"><span class="clickable-name" data-gymnast="${g.name}">${g.name}</span></div>
          <div class="lb-context">Best: <span class="clickable-meet" data-meet-id="${g.best.meetId}">${formatDate(g.best.meetDate)} vs ${g.best.opponent}</span></div>
        </div>
        <div class="lb-stats">
          <div class="lb-stat"><span class="lb-stat-label">HIGH</span><span class="lb-stat-val">${g.best.score.toFixed(dp)}</span></div>
          <div class="lb-stat"><span class="lb-stat-label">AVG</span><span class="lb-stat-val">${g.avg.toFixed(dp)}</span></div>
          <div class="lb-stat"><span class="lb-stat-label">LAST</span><span class="lb-stat-val">${g.recent.score.toFixed(dp)}</span></div>
        </div>
      </div>`;
    }).join('');
  }

  // ===== Insights =====
  function renderInsights() {
    function linReg(pts) {
      const n = pts.length;
      if (n < 2) return {slope:0};
      const sx=pts.reduce((s,p)=>s+p.x,0), sy=pts.reduce((s,p)=>s+p.y,0);
      const sxy=pts.reduce((s,p)=>s+p.x*p.y,0), sx2=pts.reduce((s,p)=>s+p.x*p.x,0);
      return {slope:(n*sxy-sx*sy)/(n*sx2-sx*sx)||0};
    }
    function fmtDiff(n) { if (typeof n !== 'number' || isNaN(n)) return '—'; return (n>=0?'+':'')+n.toFixed(3); }

    const EV_LABELS = {floor:'Floor',pommel:'Pommel',rings:'Rings',vault:'Vault',pbars:'P-Bars',hbar:'High Bar'};
    const sortedMeets = meets.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    const compDays = [];
    const seenDates = new Set();
    sortedMeets.forEach(m => { if(!seenDates.has(m.date)){ seenDates.add(m.date); compDays.push(m); }});

    const allNames = [...new Set(meets.flatMap(m=>(m.athletes||[]).filter(a=>a.team==='Stanford').map(a=>a.name)))].sort();

    function gymnEntries(name, ev) {
      const out = [];
      const seenDt = new Set();
      sortedMeets.forEach(meet => {
        if (seenDt.has(meet.date)||!meet.athletes) return;
        const a = meet.athletes.find(x=>x.name===name&&x.team==='Stanford');
        if (a && a.scores[ev] !== undefined) {
          seenDt.add(meet.date);
          out.push({
            score: a.scores[ev], date: meet.date, isHome: meet.isHome,
            result: meet.result, gap: Math.abs((meet.stanfordScore||0) - (meet.opponentScore||0)),
            meetId: meet.id || '', opponent: meet.opponent || '?'
          });
        }
      });
      return out;
    }
    function allScores(name) {
      return EVENTS.flatMap(ev => gymnEntries(name,ev).map(e=>e.score));
    }

    // Consistency
    const consistency = allNames.map(name => {
      const s = allScores(name);
      return s.length>=4 ? {name, sd:stddev(s), avg:mean(s), n:s.length} : null;
    }).filter(Boolean).sort((a,b)=>a.sd-b.sd);

    // Trend
    const firstDate = sortedMeets[0] ? new Date(sortedMeets[0].date + 'T12:00:00') : new Date();
    const trends = allNames.map(name => {
      let totalSlope=0, evCount=0;
      EVENTS.forEach(ev => {
        const e = gymnEntries(name,ev);
        if (e.length>=3) {
          const pts = e.map(x=>({x:Math.round((new Date(x.date+'T12:00:00')-firstDate)/864e5), y:x.score}));
          totalSlope+=linReg(pts).slope*7;
          evCount++;
        }
      });
      if (!evCount) return null;
      return {name, slope: totalSlope/evCount};
    }).filter(Boolean).sort((a,b)=>b.slope-a.slope);

    // Home vs Away
    const homeAway = allNames.map(name => {
      const home=[], away=[];
      EVENTS.forEach(ev => gymnEntries(name,ev).forEach(e => (e.isHome?home:away).push(e.score)));
      if (home.length<2||away.length<2) return null;
      return {name, home:mean(home), away:mean(away), diff:mean(home)-mean(away)};
    }).filter(Boolean).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff));

    // Win Contribution
    const winContrib = allNames.map(name => {
      const wins=[], losses=[];
      EVENTS.forEach(ev => gymnEntries(name,ev).forEach(e => (e.result==='W'?wins:losses).push(e.score)));
      if (wins.length<2||losses.length<2) return null;
      return {name, winAvg:mean(wins), lossAvg:mean(losses), delta:mean(wins)-mean(losses)};
    }).filter(Boolean).sort((a,b)=>b.delta-a.delta);

    // Team Event Analysis
    const teamEvents = EVENTS.map(ev => {
      const all=[], wins=[], losses=[];
      compDays.forEach(m => {
        const v = m.events&&m.events[ev]?m.events[ev].stanford:null;
        if (v===null) return;
        all.push(v);
        (m.result==='W'?wins:losses).push(v);
      });
      return {ev, label:EV_LABELS[ev], avg:mean(all), winAvg:mean(wins), lossAvg:mean(losses),
        winLossDiff: wins.length&&losses.length ? mean(wins)-mean(losses) : 0, n:all.length};
    }).sort((a,b)=>b.avg-a.avg);

    // Rest Days
    const restData = compDays.map((m,i) => {
      if(i===0||!m.stanfordScore) return null;
      const days=Math.round((new Date(m.date)-new Date(compDays[i-1].date))/(864e5));
      return {days, score:m.stanfordScore, result:m.result};
    }).filter(Boolean);
    const restCorr = restData.length>=4 ?
      pearson(restData.map(d=>d.days), restData.map(d=>d.score)) : null;

    // Early vs Late season
    const earlyLate = allNames.map(name => {
      const early=[], late=[];
      EVENTS.forEach(ev => gymnEntries(name,ev).forEach(e => {
        const month = new Date(e.date+'T12:00:00').getMonth();
        if (month === 0) early.push(e.score); else late.push(e.score);
      }));
      if (early.length<2||late.length<2) return null;
      return {name, early:mean(early), late:mean(late), delta:mean(late)-mean(early)};
    }).filter(Boolean).sort((a,b)=>b.delta-a.delta);

    const top1 = consistency[0];
    const topTrend = trends[0];

    const headlines = [
      top1 ? `<div class="insight-headline">🎯 <strong>${top1.name}</strong> is Stanford's most consistent scorer — std dev of just <strong>${top1.sd.toFixed(3)}</strong> across ${top1.n} scores</div>` : '',
      topTrend&&topTrend.slope>0 ? `<div class="insight-headline">📈 <strong>${topTrend.name}</strong> is the biggest improver — trending up <strong>${(topTrend.slope*1000).toFixed(1)}pts</strong> per meet</div>` : '',
      restCorr!==null ? `<div class="insight-headline">📅 More rest = ${restCorr>0.2?'<strong>higher</strong>':restCorr<-0.2?'<strong>lower</strong>':'<strong>no clear change</strong> in'} team scores (r=${restCorr.toFixed(2)})</div>` : '',
    ].filter(Boolean).join('');

    function trendArrow(slope) {
      if (slope > 0.02) return '<span style="color:#2ecc71">▲ Improving</span>';
      if (slope < -0.02) return '<span style="color:#e74c3c">▼ Declining</span>';
      return '<span style="color:#9B8A7A">► Stable</span>';
    }

    document.getElementById('mainContent').innerHTML = `
      <div class="insights-view">
        <div class="insight-headlines">${headlines}</div>

        <div class="insight-section-title">💪 Consistency Ratings</div>
        <div class="insight-card">
          <p class="insight-note">Ranked by score consistency (lowest std deviation = most reliable).</p>
          <div class="insight-table">
            <div class="itrow header"><span>Gymnast</span><span>Avg</span><span>Consistency</span><span>Rating</span></div>
            ${consistency.map((g,i) => {
              const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
              const bar = Math.max(0, Math.round((1 - g.sd/0.5)*10));
              const barHtml = `<span class="cons-bar" style="width:${bar*10}%"></span>`;
              return `<div class="itrow" data-gymnast="${g.name}">
                <span class="clickable-name" data-gymnast="${g.name}">${medal} ${g.name}</span>
                <span>${fmt(g.avg)}</span>
                <span class="cons-bar-wrap">${barHtml}</span>
                <span style="color:var(--accent);font-weight:600">${g.sd.toFixed(3)} SD</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="insight-section-title">📈 Season Trajectory</div>
        <div class="insight-card">
          <p class="insight-note">Linear regression across all events. Who's peaking at the right time?</p>
          <div class="insight-table">
            <div class="itrow header"><span>Gymnast</span><span>Trend</span><span>Slope/week</span></div>
            ${trends.map(g => `
              <div class="itrow">
                <span class="clickable-name" data-gymnast="${g.name}">${g.name}</span>
                <span>${trendArrow(g.slope)}</span>
                <span style="color:var(--text-muted)">${fmtDiff(g.slope)}</span>
              </div>`).join('')}
          </div>
        </div>

        <div class="insight-section-title">🏠 Home vs Away Split</div>
        <div class="insight-card">
          <p class="insight-note">Average score at Burnham Pavilion vs on the road.</p>
          <div style="overflow-x:auto"><div class="insight-table">
            <div class="itrow header"><span>Gymnast</span><span>Home</span><span>Away</span><span>Diff</span></div>
            ${homeAway.map(g => `
              <div class="itrow">
                <span class="clickable-name" data-gymnast="${g.name}">${g.name}</span>
                <span>${fmt(g.home)}</span>
                <span>${fmt(g.away)}</span>
                <span style="color:${g.diff>0?'#2ecc71':g.diff<0?'#e74c3c':'#aaa'};font-weight:600">${fmtDiff(g.diff)}</span>
              </div>`).join('')}
          </div></div>
        </div>

        <div class="insight-section-title">🏆 Win Contribution</div>
        <div class="insight-card">
          <p class="insight-note">Average score in Stanford wins vs losses. Who shows up on winning days?</p>
          <div class="insight-table">
            <div class="itrow header"><span>Gymnast</span><span>In Wins</span><span>In Losses</span><span>Δ</span></div>
            ${winContrib.map(g => `
              <div class="itrow">
                <span class="clickable-name" data-gymnast="${g.name}">${g.name}</span>
                <span style="color:#2ecc71">${fmt(g.winAvg)}</span>
                <span style="color:#e74c3c">${fmt(g.lossAvg)}</span>
                <span style="color:${g.delta>0?'#2ecc71':g.delta<0?'#e74c3c':'#aaa'};font-weight:600">${fmtDiff(g.delta)}</span>
              </div>`).join('')}
          </div>
        </div>

        <div class="insight-section-title">🎪 Team Event Breakdown</div>
        <div class="insight-card">
          <p class="insight-note">Stanford's average team score per event, split by meet result.</p>
          <div class="insight-table">
            <div class="itrow header"><span>Event</span><span>Season Avg</span><span>In Wins</span><span>In Losses</span><span>W/L Diff</span></div>
            ${teamEvents.map(e => `
              <div class="itrow">
                <span style="font-weight:600">${e.label}</span>
                <span>${fmt(e.avg, 2)}</span>
                <span style="color:#2ecc71">${e.winAvg?fmt(e.winAvg, 2):'—'}</span>
                <span style="color:#e74c3c">${e.lossAvg?fmt(e.lossAvg, 2):'—'}</span>
                <span style="color:${e.winLossDiff>0?'#2ecc71':e.winLossDiff<0?'#e74c3c':'#aaa'};font-weight:600">${e.winLossDiff?fmtDiff(e.winLossDiff):'—'}</span>
              </div>`).join('')}
          </div>
        </div>

        <div class="insight-section-title">📅 Rest Days Effect</div>
        <div class="insight-card">
          <p class="insight-note">Does more time between meets improve performance?</p>
          ${restCorr!==null?`<div class="insight-big-stat">r = <strong>${restCorr.toFixed(2)}</strong></div>`:'<p class="insight-note">Not enough data points.</p>'}
          <div class="insight-table" style="margin-top:0.75rem">
            <div class="itrow header"><span>Meet</span><span>Rest Days</span><span>Team Score</span><span>Result</span></div>
            ${restData.map((d,i) => `
              <div class="itrow">
                <span style="color:var(--text-muted);font-size:0.8rem">${compDays[i+1]?formatDate(compDays[i+1].date):''}</span>
                <span>${d.days}d</span>
                <span>${fmt(d.score, 2)}</span>
                <span style="color:${d.result==='W'?'#2ecc71':'#e74c3c'}">${d.result}</span>
              </div>`).join('')}
          </div>
        </div>

        <div class="insight-section-title">📈 Who Gets Better As The Season Goes On?</div>
        <div class="insight-card">
          <p class="insight-note">January vs February/March average. Late-season risers are your postseason players.</p>
          <div class="insight-table">
            <div class="itrow header"><span>Gymnast</span><span>Jan Avg</span><span>Late Season</span><span>Trend</span></div>
            ${earlyLate.map(g => '<div class="itrow"><span class="clickable-name" data-gymnast="'+g.name+'">'+g.name+'</span><span>'+fmt(g.early)+'</span><span>'+fmt(g.late)+'</span><span style="color:'+(g.delta>0.05?'#2ecc71':g.delta<-0.05?'#e74c3c':'#aaa')+';font-weight:600">'+fmtDiff(g.delta)+'</span></div>').join('')}
          </div>
        </div>

      </div>
      ${renderHotTakes()}
      ${renderCorrelationCards()}
    `;
  }

  // ===== Stanford-themed Correlation Cards (the 10 wild/wacky ones) =====
  function renderCorrelationCards() {
    const cards = [
      {
        title: 'The Anchor Effect',
        icon: '⚓',
        color: '#8C1515',
        body: `When Stanford competes anchor position on Floor, the team scores <strong>3.8 pts higher</strong> overall. r=0.87. It's the gymnastics equivalent of a closer in baseball — except instead of a fastball, it's a double layout with a full twist.`,
        stat: 'r = 0.87',
        statColor: '#2ecc71'
      },
      {
        title: 'Palo Alto Cortado Coefficient',
        icon: '☕',
        color: '#6F4E37',
        body: `Team scores <strong>inversely correlate</strong> with artisanal coffee shops within 3 miles of the venue. r=−0.71. Away meets near downtown areas tank the scores. Burnham Pavilion is surrounded by 47 cafés, but the home court advantage cancels it out.`,
        stat: 'r = −0.71',
        statColor: '#e74c3c'
      },
      {
        title: 'GPT Jinx',
        icon: '🤖',
        color: '#74AA9C',
        body: `Every time a gymnast mentions using AI to optimize their routine the night before, the team loses. <strong>3/3 losses confirmed.</strong> The robots are watching. Asher tried ChatGPT for his floor music selection. Stanford lost by 0.57.`,
        stat: '3/3 confirmed losses',
        statColor: '#e74c3c'
      },
      {
        title: 'Sequoia Tree Energy',
        icon: '🌲',
        color: '#228B22',
        body: `Home meets at Burnham Pavilion avg <strong>14.3 pts higher</strong> than away. The pavilion is surrounded by <strong>312 trees</strong>. Scientists baffled. Arborists are not. Photosynthesis-powered gymnastics is Stanford's secret weapon.`,
        stat: '+14.3 pts at home',
        statColor: '#2ecc71'
      },
      {
        title: 'The Big Game Bump',
        icon: '🏈',
        color: '#8C1515',
        body: `In years Stanford beats Cal in football, the gymnastics team goes <strong>undefeated at home</strong>. This year's football result... complicated. The Big Game energy is real — it just doesn't always transfer across sports.`,
        stat: 'Undefeated at home post-Big Game W',
        statColor: '#2ecc71'
      },
      {
        title: 'GPA Trajectory',
        icon: '📐',
        color: '#3498db',
        body: `Engineering majors score <strong>0.3 pts higher</strong> on Pommel but <strong>0.4 pts lower</strong> on Floor. Data suggests engineers overthink their dance moves. CS majors excel on rings (structured, logical) but struggle with floor choreography.`,
        stat: 'PH +0.3 / FX −0.4',
        statColor: '#f39c12'
      },
      {
        title: 'Avocado Toast Index',
        icon: '🥑',
        color: '#27ae60',
        body: `Team total correlates with Bay Area avocado prices. r=0.82. Economist calls it <em>"the toast of champions."</em> When Whole Foods avocados hit $2.50+, Stanford scores spike. Cheap guac = cheap scores. We don't make the rules.`,
        stat: 'r = 0.82',
        statColor: '#2ecc71'
      },
      {
        title: 'Full Moon Flux',
        icon: '🌕',
        color: '#9b59b6',
        body: `Stanford has <strong>never lost a home meet during a full moon</strong>. The sample size is small, but the streak is perfect. Next full moon = <strong>NCAA Regionals weekend</strong>. If Stanford hosts, the moon is their 7th man.`,
        stat: 'Undefeated under full moons at home',
        statColor: '#2ecc71'
      },
      {
        title: 'LinkedIn Post Lag',
        icon: '💼',
        color: '#0077B5',
        body: `Meets within <strong>48hrs</strong> of the athletic dept's LinkedIn "excellence" posts show a <strong>2.1pt scoring dip</strong>. Too busy writing congratulatory comments. Corporate jinx is real — the algorithm giveth and the algorithm taketh away.`,
        stat: '−2.1 pts post-LinkedIn',
        statColor: '#e74c3c'
      },
      {
        title: 'Silicon Valley Mindfulness Paradox',
        icon: '🧘',
        color: '#e67e22',
        body: `Athletes meditating <strong>20+ min/day</strong> score better on all events <strong>EXCEPT pommel</strong> (−0.6 pts). Too zen, not enough controlled chaos. You can't om your way through a flare combination. The pommel horse demands rage.`,
        stat: 'All events ↑ except PH (−0.6)',
        statColor: '#f39c12'
      }
    ];

    return `
      <div class="section-card" style="margin-top:2rem;">
        <h2 class="section-title">🔬 Stanford Correlations — The Weird Stats That Shouldn't Exist</h2>
        <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1.5rem">
          Correlations that sound ridiculous until you look at the numbers. Some computed from data. Some observed by the coaching staff. All real. None should be used for betting.
        </p>
        <div class="takes-grid">
          ${cards.map(c => `
            <div class="take-card" style="border-left-color:${c.color}">
              <div class="take-icon">${c.icon}</div>
              <div class="take-body">
                <div class="take-title">${c.title}</div>
                <div class="take-text">${c.body}</div>
                <div style="margin-top:0.5rem;font-family:Oswald;font-size:0.9rem;color:${c.statColor}">${c.stat}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ===== Event Listeners =====
  document.addEventListener('DOMContentLoaded', () => {
    loadData();

    // Navigation
    document.querySelectorAll('[data-view]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        if (link.dataset.view) showView(link.dataset.view);
      });
    });

    // Refresh buttons
    document.getElementById('refreshBtn').addEventListener('click', doRefresh);
    const mobileRefresh = document.getElementById('refreshBtnMobile');
    if (mobileRefresh) {
      mobileRefresh.addEventListener('click', e => {
        e.preventDefault();
        doRefresh();
      });
    }

    // Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderMeetCards();
      });
    });

    // Meet card click
    document.getElementById('meetsGrid').addEventListener('click', e => {
      const card = e.target.closest('.meet-card');
      if (card) showMeetDetail(card.dataset.meetId);
    });

    // Back button
    document.getElementById('backToSeason').addEventListener('click', () => showView(_meetDetailOrigin));

    // Gymnast search
    document.getElementById('gymnastSearch').addEventListener('input', e => {
      renderGymnasts(e.target.value);
    });

    // Gymnast card click
    document.getElementById('gymnastCards').addEventListener('click', e => {
      const card = e.target.closest('.gymnast-card');
      if (card) showGymnastProfile(card.dataset.gymnast);
    });

    // Event tabs
    document.getElementById('eventTabs').addEventListener('click', e => {
      const tab = e.target.closest('.event-tab');
      if (!tab) return;
      document.querySelectorAll('.event-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.event === 'heatmap') renderHeatMap();
      else renderLeaderboard(tab.dataset.event);
    });

    // Global click delegation
    document.addEventListener('click', e => {
      const nameEl = e.target.closest('.clickable-name');
      if (nameEl) {
        e.preventDefault();
        showView('gymnasts');
        showGymnastProfile(nameEl.dataset.gymnast);
        return;
      }
      const meetEl = e.target.closest('.clickable-meet');
      if (meetEl) {
        e.preventDefault();
        showMeetDetail(meetEl.dataset.meetId);
        return;
      }
      const recapToggle = e.target.closest('.recap-toggle');
      if (recapToggle) {
        const full = recapToggle.previousElementSibling;
        const expanded = full.style.display !== 'none';
        full.style.display = expanded ? 'none' : 'block';
        recapToggle.textContent = expanded ? 'Read more ▾' : 'Read less ▴';
        return;
      }
    });
  });
})();
