/**
 * Stanford Men's Gymnastics – Global Search Module
 *
 * Builds a searchable index from meets data and renders a dropdown UI
 * with grouped results (Gymnasts, Meets, Events, Locations, Scores).
 *
 * Attach to window as StanfordSearch.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  var EVENT_NAMES = {
    floor:  'Floor Exercise',
    pommel: 'Pommel Horse',
    rings:  'Still Rings',
    vault:  'Vault',
    pbars:  'Parallel Bars',
    hbar:   'Horizontal Bar',
    aa:     'All-Around'
  };

  var EVENT_KEYS = ['floor', 'pommel', 'rings', 'vault', 'pbars', 'hbar'];

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  var index = {
    gymnasts:  [],  // { name, id }
    meets:     [],  // { label, id, date }
    events:    [],  // { label, key }
    locations: [],  // { label, id }
    scores:    []   // { label, gymnast, gymnastId, event, meetId, score }
  };

  var callbacks = {
    onGymnastSelect:     null,
    onMeetSelect:        null,
    onLeaderboardSelect: null,
    onFilterSelect:      null
  };

  // ---------------------------------------------------------------------------
  // Index builder
  // ---------------------------------------------------------------------------

  function buildIndex(meets) {
    var gymnastMap  = {};
    var meetMap     = {};
    var locationMap = {};
    var eventSet    = {};
    var scoreList   = [];

    if (!meets || !Array.isArray(meets)) return;

    meets.forEach(function (meet) {
      // Meets
      var meetId = meet.id || meet.name;
      if (!meetMap[meetId]) {
        meetMap[meetId] = {
          label: meet.name || meetId,
          id:    meetId,
          date:  meet.date || ''
        };
      }

      // Locations
      if (meet.location) {
        var locKey = meet.location;
        if (!locationMap[locKey]) {
          locationMap[locKey] = {
            label: meet.location,
            id:    meetId
          };
        }
      }

      // Gymnasts & scores
      var gymnasts = meet.gymnasts || meet.lineup || [];
      gymnasts.forEach(function (g) {
        var gName = g.name || '';
        var gId   = g.id || gName;

        if (gName && !gymnastMap[gId]) {
          gymnastMap[gId] = { name: gName, id: gId };
        }

        // Individual event scores
        EVENT_KEYS.forEach(function (evt) {
          var score = null;

          // Support different data shapes
          if (g.scores && g.scores[evt] != null) {
            score = g.scores[evt];
          } else if (g[evt] != null) {
            score = g[evt];
          } else if (g.stanfordScore && g.stanfordScore[evt] != null) {
            score = g.stanfordScore[evt];
          }

          if (score != null && score > 0) {
            eventSet[evt] = true;
            scoreList.push({
              label:      gName + ' – ' + EVENT_NAMES[evt] + ': ' + Number(score).toFixed(2),
              gymnast:    gName,
              gymnastId:  gId,
              event:      evt,
              meetId:     meetId,
              score:      Number(score)
            });
          }
        });

        // All-around: computed if gymnast has all 6 events
        var eventsHit  = new Set();
        var aaTotal    = 0;

        EVENT_KEYS.forEach(function (evt) {
          var s = null;
          if (g.scores && g.scores[evt] != null)              s = g.scores[evt];
          else if (g[evt] != null)                             s = g[evt];
          else if (g.stanfordScore && g.stanfordScore[evt] != null) s = g.stanfordScore[evt];

          if (s != null && s > 0) {
            eventsHit.add(evt);
            aaTotal += Number(s);
          }
        });

        // Also accept an explicit aa field
        var explicitAA = null;
        if (g.scores && g.scores.aa != null)              explicitAA = g.scores.aa;
        else if (g.aa != null)                             explicitAA = g.aa;
        else if (g.stanfordScore && g.stanfordScore.aa != null) explicitAA = g.stanfordScore.aa;

        if (explicitAA != null && explicitAA > 0) {
          eventSet.aa = true;
          scoreList.push({
            label:      gName + ' – ' + EVENT_NAMES.aa + ': ' + Number(explicitAA).toFixed(2),
            gymnast:    gName,
            gymnastId:  gId,
            event:      'aa',
            meetId:     meetId,
            score:      Number(explicitAA)
          });
        } else if (eventsHit.size === 6) {
          eventSet.aa = true;
          scoreList.push({
            label:      gName + ' – ' + EVENT_NAMES.aa + ': ' + aaTotal.toFixed(2),
            gymnast:    gName,
            gymnastId:  gId,
            event:      'aa',
            meetId:     meetId,
            score:      Number(aaTotal.toFixed(2))
          });
        }
      });
    });

    // Populate index arrays
    index.gymnasts = Object.keys(gymnastMap).map(function (k) {
      return gymnastMap[k];
    });

    index.meets = Object.keys(meetMap).map(function (k) {
      return meetMap[k];
    });

    index.locations = Object.keys(locationMap).map(function (k) {
      return locationMap[k];
    });

    index.events = Object.keys(eventSet).map(function (k) {
      return { label: EVENT_NAMES[k], key: k };
    });

    index.scores = scoreList;
  }

  // ---------------------------------------------------------------------------
  // Fuzzy / AND search
  // ---------------------------------------------------------------------------

  function matchesQuery(text, terms) {
    var lower = text.toLowerCase();
    for (var i = 0; i < terms.length; i++) {
      if (lower.indexOf(terms[i]) === -1) return false;
    }
    return true;
  }

  function search(query) {
    if (!query || !query.trim()) return null;

    var terms = query.toLowerCase().trim().split(/\s+/);
    var results = {
      gymnasts:  [],
      meets:     [],
      events:    [],
      locations: [],
      scores:    []
    };

    index.gymnasts.forEach(function (g) {
      if (matchesQuery(g.name, terms)) results.gymnasts.push(g);
    });

    index.meets.forEach(function (m) {
      var searchable = m.label + ' ' + m.date;
      if (matchesQuery(searchable, terms)) results.meets.push(m);
    });

    index.events.forEach(function (e) {
      if (matchesQuery(e.label, terms)) results.events.push(e);
    });

    index.locations.forEach(function (l) {
      if (matchesQuery(l.label, terms)) results.locations.push(l);
    });

    index.scores.forEach(function (s) {
      if (matchesQuery(s.label, terms)) results.scores.push(s);
    });

    // Cap scores at a reasonable number
    results.scores = results.scores.slice(0, 20);

    var total = results.gymnasts.length + results.meets.length +
                results.events.length + results.locations.length +
                results.scores.length;

    return total > 0 ? results : null;
  }

  // ---------------------------------------------------------------------------
  // Dropdown rendering
  // ---------------------------------------------------------------------------

  function renderDropdown(results, container) {
    container.innerHTML = '';

    if (!results) {
      container.style.display = 'none';
      return;
    }

    var groups = [
      { key: 'gymnasts',  title: 'Gymnasts',  items: results.gymnasts },
      { key: 'meets',     title: 'Meets',      items: results.meets },
      { key: 'events',    title: 'Events',     items: results.events },
      { key: 'locations', title: 'Locations',  items: results.locations },
      { key: 'scores',    title: 'Scores',     items: results.scores }
    ];

    groups.forEach(function (group) {
      if (!group.items || group.items.length === 0) return;

      var header = document.createElement('div');
      header.className = 'search-group-header';
      header.textContent = group.title;
      container.appendChild(header);

      group.items.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'search-result-item';
        row.setAttribute('tabindex', '-1');
        row.setAttribute('role', 'option');
        row.setAttribute('data-group', group.key);

        var label = '';
        if (group.key === 'gymnasts')  label = item.name;
        else if (group.key === 'meets')     label = item.label + (item.date ? ' (' + item.date + ')' : '');
        else if (group.key === 'events')    label = item.label;
        else if (group.key === 'locations') label = item.label;
        else if (group.key === 'scores')    label = item.label;

        row.textContent = label;

        row.addEventListener('click', function () {
          handleSelect(group.key, item);
        });

        // Store reference for keyboard nav
        row._searchData = { group: group.key, item: item };

        container.appendChild(row);
      });
    });

    container.style.display = container.children.length > 0 ? 'block' : 'none';
  }

  // ---------------------------------------------------------------------------
  // Selection handler
  // ---------------------------------------------------------------------------

  function handleSelect(group, item) {
    switch (group) {
      case 'gymnasts':
        if (typeof callbacks.onGymnastSelect === 'function') {
          callbacks.onGymnastSelect(item);
        }
        break;
      case 'meets':
        if (typeof callbacks.onMeetSelect === 'function') {
          callbacks.onMeetSelect(item);
        }
        break;
      case 'events':
        if (typeof callbacks.onLeaderboardSelect === 'function') {
          callbacks.onLeaderboardSelect(item);
        }
        break;
      case 'locations':
        if (typeof callbacks.onFilterSelect === 'function') {
          callbacks.onFilterSelect(item);
        }
        break;
      case 'scores':
        // Scores navigate to the gymnast profile for that event
        if (typeof callbacks.onGymnastSelect === 'function') {
          callbacks.onGymnastSelect({
            name:    item.gymnast,
            id:      item.gymnastId,
            event:   item.event,
            meetId:  item.meetId
          });
        }
        break;
    }

    // Close all open dropdowns
    var dropdowns = document.querySelectorAll('.search-dropdown');
    dropdowns.forEach(function (dd) {
      dd.style.display = 'none';
    });

    var inputs = document.querySelectorAll('.stanford-search-input');
    inputs.forEach(function (inp) {
      inp.value = '';
    });
  }

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------

  function getResultItems(dropdown) {
    return dropdown.querySelectorAll('.search-result-item');
  }

  function setActiveItem(items, idx) {
    items.forEach(function (el, i) {
      if (i === idx) {
        el.classList.add('search-result-active');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.classList.remove('search-result-active');
      }
    });
  }

  function attachKeyboardNav(input, dropdown) {
    var activeIdx = -1;

    input.addEventListener('keydown', function (e) {
      var items = getResultItems(dropdown);
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        setActiveItem(items, activeIdx);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        setActiveItem(items, activeIdx);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < items.length) {
          var data = items[activeIdx]._searchData;
          if (data) handleSelect(data.group, data.item);
        }
      } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        input.blur();
        activeIdx = -1;
      }
    });

    // Reset active index when results change
    input.addEventListener('input', function () {
      activeIdx = -1;
    });
  }

  // ---------------------------------------------------------------------------
  // UI creation helpers
  // ---------------------------------------------------------------------------

  function createSearchWidget(id, placeholder) {
    var wrapper = document.createElement('div');
    wrapper.className = 'stanford-search-wrapper';
    wrapper.id = id;
    wrapper.style.position = 'relative';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'stanford-search-input';
    input.placeholder = placeholder || 'Search Stanford gymnastics...';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-haspopup', 'listbox');

    var dropdown = document.createElement('div');
    dropdown.className = 'search-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.style.display = 'none';

    input.addEventListener('input', function () {
      var results = search(input.value);
      renderDropdown(results, dropdown);
      input.setAttribute('aria-expanded', results ? 'true' : 'false');
    });

    input.addEventListener('focus', function () {
      if (input.value.trim()) {
        var results = search(input.value);
        renderDropdown(results, dropdown);
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) {
        dropdown.style.display = 'none';
        input.setAttribute('aria-expanded', 'false');
      }
    });

    attachKeyboardNav(input, dropdown);

    wrapper.appendChild(input);
    wrapper.appendChild(dropdown);

    return { wrapper: wrapper, input: input, dropdown: dropdown };
  }

  // ---------------------------------------------------------------------------
  // Public: createUI
  // ---------------------------------------------------------------------------

  function createUI() {
    // Desktop search
    var desktopTarget = document.getElementById('search-desktop');
    if (desktopTarget) {
      var desktop = createSearchWidget('stanford-search-desktop', 'Search Stanford gymnastics... (/)');
      desktopTarget.appendChild(desktop.wrapper);
    }

    // Mobile search
    var mobileTarget = document.getElementById('search-mobile');
    if (mobileTarget) {
      var mobile = createSearchWidget('stanford-search-mobile', 'Search...');
      mobileTarget.appendChild(mobile.wrapper);
    }

    // '/' keyboard shortcut to focus the desktop search input
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !isInputFocused()) {
        e.preventDefault();
        var inp = document.querySelector('#stanford-search-desktop .stanford-search-input');
        if (inp) inp.focus();
      }
    });
  }

  function isInputFocused() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  window.StanfordSearch = {
    EVENT_NAMES: EVENT_NAMES,
    EVENT_KEYS:  EVENT_KEYS,

    buildIndex: buildIndex,
    createUI:   createUI,
    search:     search,

    // Callback setters
    set onGymnastSelect(fn)     { callbacks.onGymnastSelect     = fn; },
    set onMeetSelect(fn)        { callbacks.onMeetSelect        = fn; },
    set onLeaderboardSelect(fn) { callbacks.onLeaderboardSelect = fn; },
    set onFilterSelect(fn)      { callbacks.onFilterSelect      = fn; },

    get onGymnastSelect()       { return callbacks.onGymnastSelect; },
    get onMeetSelect()          { return callbacks.onMeetSelect; },
    get onLeaderboardSelect()   { return callbacks.onLeaderboardSelect; },
    get onFilterSelect()        { return callbacks.onFilterSelect; }
  };
})();
