(() => {
  // Check CDN dependencies before the first D3 or Leaflet call.
  if (typeof d3 === "undefined" || typeof L === "undefined") {
    document.body.innerHTML = `
      <div style="max-width:720px;margin:60px auto;font-family:'Times New Roman',Times,serif;padding:24px">
        <h1>Prototype libraries did not load</h1>
        <p>This prototype uses D3.js and Leaflet from public CDNs. Connect to the internet and reload the page.</p>
      </div>`;
    return;
  }

  const dataset = window.RESTROOM_DATA;
  const facilities = dataset.facilities;

  const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
  const DAY_LABEL = Object.fromEntries(DAYS.map(d => [d, d[0].toUpperCase() + d.slice(1)]));
  const STATUS_LABEL = {
    open: "Listed open",
    closed: "Listed closed",
    conditional: "Conditional",
    unknown: "Hours unknown"
  };
  const COLORS = {
    open: "#173f73",
    closed: "#d95b43",
    conditional: "#e6a13a",
    unknown: "#8d98a5"
  };
  const ACCESS_LABEL = {
    fully_accessible: "Fully accessible",
    partially_accessible: "Partially accessible",
    limited_accessibility: "Limited accessibility",
    not_accessible: "Not accessible",
    unknown: "Unknown"
  };
  const CHANGING_LABEL = {
    yes: "Yes",
    no: "No",
    unknown: "Unknown"
  };

  let state = {
    frame: 1,
    day: "tuesday",
    minute: 840,
    frame2Visible: new Set(["open","closed","conditional","unknown"]),
    accessibility: new Set(["fully_accessible"]),
    changing: "all",
    locationType: "all",
    summaryPopulation: "all",
    overviewSearch: ""
  };

  const maps = {};
  const selectedFacilities = {};
  const tooltip = d3.select("#tooltip");

  document.getElementById("overview-total").textContent = d3.format(",")(facilities.length);

  function normalizeSearch(s) {
    return (s || "").toLowerCase().trim();
  }

  function formatTime(minute) {
    const m = Math.max(0, Math.min(1439, +minute));
    const h24 = Math.floor(m / 60);
    const mins = m % 60;
    const suffix = h24 >= 12 ? "PM" : "AM";
    const h = h24 % 12 || 12;
    return `${h}:${String(mins).padStart(2,"0")} ${suffix}`;
  }

  function humanize(value) {
    if (!value) return "Unknown";
    return value.replaceAll("_"," ").replace(/\b\w/g, c => c.toUpperCase());
  }

  // If a conditional schedule contains an explicit interval, that interval is treated
  // as a listed base interval. Outside it, the result remains conditional.
  function availabilityAt(facility, day = state.day, minute = state.minute) {
    const d = facility.schedule.days[day];
    if (!d) return "unknown";

    if (d.state === "unknown") return "unknown";
    if (d.state === "closed") return "closed";

    const intervals = Array.isArray(d.intervals) ? d.intervals : [];
    const inInterval = intervals.some(([open, close]) => open <= minute && minute < close);

    if (d.state === "known") return inInterval ? "open" : "closed";
    if (d.state === "conditional") return inInterval ? "open" : "conditional";
    return "unknown";
  }

  function hasScheduleQualification(f) {
    return f.schedule.parse_status === "conditional" ||
      Boolean(f.schedule.qualification) ||
      f.schedule.type === "seasonal_extension" ||
      f.schedule.type === "daylight_dependent" ||
      f.schedule.type === "permit_only";
  }

  function overviewCategory(f) {
    if (["missing","unparsed","partial"].includes(f.schedule.parse_status)) return "unknown";
    if (f.schedule.parse_status === "conditional") return "conditional";
    return "known";
  }

  function countsByStatus(list, day = state.day, minute = state.minute) {
    const c = { open: 0, closed: 0, conditional: 0, unknown: 0 };
    list.forEach(f => c[availabilityAt(f, day, minute)]++);
    return c;
  }

  function frame3Filtered() {
    return facilities.filter(f => {
      if (!state.accessibility.has(f.accessibility.category)) return false;
      if (state.changing !== "all" && f.changing_station.any !== state.changing) return false;
      if (state.locationType !== "all" && f.location_type !== state.locationType) return false;
      return true;
    });
  }

  function summaryFiltered() {
    if (state.summaryPopulation === "accessible") {
      return facilities.filter(f =>
        ["fully_accessible","partially_accessible","limited_accessibility"].includes(f.accessibility.category)
      );
    }
    if (state.summaryPopulation === "changing") {
      return facilities.filter(f => f.changing_station.any === "yes");
    }
    return facilities;
  }

  function createMap(id) {
    if (maps[id]) {
      setTimeout(() => maps[id].map.invalidateSize(), 0);
      return maps[id];
    }

    // A rectangular navigation boundary surrounds all five boroughs.
    const cityBounds = L.latLngBounds([40.477, -74.26], [40.918, -73.70]);
    const map = L.map(id, {
      zoomControl: false,
      preferCanvas: false,
      maxBounds: cityBounds,
      maxBoundsViscosity: 1,
      minZoom: 10,
      maxZoom: 19
    }).setView([40.708, -73.98], 11);
    const zoomControl = L.control.zoom({ position: "bottomright" }).addTo(map);
    // Place zoom controls outside the map's stacking context, above the cards.
    const zoomOverlay = document.createElement("div");
    zoomOverlay.className = "map-zoom-overlay";
    document.getElementById(id).closest(".frame").appendChild(zoomOverlay);
    zoomOverlay.appendChild(zoomControl.getContainer());
    L.DomEvent.disableClickPropagation(zoomOverlay);
    L.DomEvent.disableScrollPropagation(zoomOverlay);

    // Keep the visible map within the NYC bounding rectangle at every screen size.
    const constrainViewport = () => {
      const minZoom = Math.max(10, map.getBoundsZoom(cityBounds, true));
      map.setMinZoom(minZoom);
      if (map.getZoom() < minZoom) map.setZoom(minZoom);
      map.panInsideBounds(cityBounds, { animate: false });
    };
    map.on("resize", constrainViewport);
    constrainViewport();

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.svg({ clickable: true }).addTo(map);
    const svg = d3.select(map.getPanes().overlayPane).select("svg");
    const g = svg.select("g").classed("restroom-overlay", true);

    const obj = { map, svg, g, points: [] };
    maps[id] = obj;

    map.on("zoomend move resize", () => positionPoints(id));
    return obj;
  }

  function positionPoints(id) {
    const m = maps[id];
    if (!m) return;
    m.g.selectAll("circle.restroom-point")
      .attr("cx", d => m.map.latLngToLayerPoint([d.latitude, d.longitude]).x)
      .attr("cy", d => m.map.latLngToLayerPoint([d.latitude, d.longitude]).y);
  }

  function showTooltip(event, f, status = null) {
    const statusText = status ? STATUS_LABEL[status] : humanize(overviewCategory(f));
    tooltip
      .style("opacity", 1)
      .html(`<strong>${escapeHtml(f.name)}</strong>${escapeHtml(f.location_type || "Facility")} · ${escapeHtml(statusText)}`)
      .style("left", `${event.clientX + 12}px`)
      .style("top", `${event.clientY + 12}px`);
  }

  function hideTooltip() {
    tooltip.style("opacity", 0);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[ch]);
  }

  function renderDetail(panelId, f, status) {
    const panel = document.getElementById(panelId);
    if (!f) {
      panel.innerHTML = `<div class="detail-empty"><div><strong>Click a restroom</strong><p>Facility details will appear here.</p></div></div>`;
      return;
    }

    const dayData = f.schedule.days[state.day];
    const intervalText = dayData && dayData.intervals?.length
      ? dayData.intervals.map(([a,b]) => `${formatTime(a)}–${b === 1440 ? "12:00 AM" : formatTime(b)}`).join(", ")
      : "No explicit interval";

    panel.innerHTML = `
      <div class="detail-kicker">${escapeHtml(f.location_type || "Facility")}</div>
      <h3>${escapeHtml(f.name)}</h3>
      <p class="detail-subtitle">${escapeHtml(f.operator || "Operator not listed")}</p>
      ${status ? `<div class="status-pill ${status}">${panelId === "detail-3" && status === "open" ? "Listed as open" : STATUS_LABEL[status]} · ${DAY_LABEL[state.day]} ${formatTime(state.minute)}</div>` : ""}
      <div class="detail-row"><span>Listed hours</span><span>${escapeHtml(f.schedule.raw_hours || "Unknown")}</span></div>
      <div class="detail-row"><span>${DAY_LABEL[state.day]}</span><span>${escapeHtml(intervalText)}</span></div>
      <div class="detail-row"><span>Accessibility</span><span>${escapeHtml(ACCESS_LABEL[f.accessibility.category] || humanize(f.accessibility.category))}</span></div>
      <div class="detail-row"><span>Changing station</span><span>${escapeHtml(CHANGING_LABEL[f.changing_station.any] || humanize(f.changing_station.any))}${f.changing_station.scope && f.changing_station.scope !== "unknown" ? ` · ${escapeHtml(humanize(f.changing_station.scope))}` : ""}</span></div>
      <div class="detail-row"><span>Seasonality</span><span>${escapeHtml(humanize(f.seasonality))}</span></div>
      <div class="detail-row"><span>Coordinates</span><span>${f.latitude.toFixed(5)}, ${f.longitude.toFixed(5)}</span></div>
    `;
  }

  function renderPoints(id, list, config = {}) {
    const m = createMap(id);
    const key = d => d.facility_id;
    const mappable = list.filter(f => f.mappable &&
      Number.isFinite(f.latitude) && Number.isFinite(f.longitude));
    const circles = m.g.selectAll("circle.restroom-point").data(mappable, key);

    circles.exit().remove();

    const enter = circles.enter()
      .append("circle")
      .attr("class", "restroom-point")
      .attr("r", 5.5)
      .attr("fill-opacity", .82)
      .attr("stroke-width", 1.2)
      .on("mousemove", function(event, d) {
        const status = config.statusFn ? config.statusFn(d) : null;
        showTooltip(event, d, status);
        d3.select(this).attr("r", 7.5);
      })
      .on("mouseleave", function() {
        hideTooltip();
        d3.select(this).attr("r", 5.5);
      })
      .on("click", function(event, d) {
        L.DomEvent.stopPropagation(event);
        const status = config.statusFn ? config.statusFn(d) : null;
        hideTooltip();
        if (config.detailPanel) {
          selectedFacilities[config.detailPanel] = d.facility_id;
          renderDetail(config.detailPanel, d, status);
          m.g.selectAll("circle.restroom-point")
            .classed("selected", f => f.facility_id === d.facility_id);
        }
      });

    const merged = enter.merge(circles)
      .attr("fill", d => config.fillFn ? config.fillFn(d) : COLORS.open)
      .attr("stroke", d => typeof config.strokeFn === "function" ? config.strokeFn(d) : (config.strokeFn || "#ffffff"))
      .attr("opacity", d => config.opacityFn ? config.opacityFn(d) : 1);

    if (config.sortFn) merged.sort(config.sortFn);

    if (config.detailPanel) {
      const selected = list.find(f => f.facility_id === selectedFacilities[config.detailPanel]);
      if (!selected) delete selectedFacilities[config.detailPanel];
      merged.classed("selected", f => f.facility_id === selected?.facility_id);
      renderDetail(config.detailPanel, selected, selected && config.statusFn ? config.statusFn(selected) : null);
    }
    positionPoints(id);
  }

  function setupDaySelects() {
    d3.selectAll(".day-select").each(function() {
      const sel = d3.select(this);
      sel.selectAll("option")
        .data(DAYS)
        .join("option")
        .attr("value", d => d)
        .text(d => DAY_LABEL[d]);
      this.value = state.day;
      sel.on("change", event => {
        state.day = event.target.value;
        syncDayTimeControls();
        renderActiveFrame();
      });
    });
  }

  function setupTimeSliders() {
    ["2","3","4"].forEach(suffix => {
      const slider = d3.select(`#time-slider-${suffix}`);
      slider.on("input", event => {
        state.minute = +event.target.value;
        syncDayTimeControls();
        renderActiveFrame();
      });
    });
  }

  function syncDayTimeControls() {
    d3.selectAll(".day-select").property("value", state.day);
    ["2","3","4"].forEach(suffix => {
      d3.select(`#time-slider-${suffix}`).property("value", state.minute);
      d3.select(`#time-output-${suffix}`).text(formatTime(state.minute));
    });
  }

  function renderFrame1() {
    const term = normalizeSearch(state.overviewSearch);
    const list = term
      ? facilities.filter(f =>
          normalizeSearch(f.name).includes(term) ||
          normalizeSearch(f.operator).includes(term) ||
          normalizeSearch(f.location_type).includes(term))
      : facilities;

    const overviewCounts = d3.rollup(facilities, v => v.length, overviewCategory);
    document.getElementById("overview-known-count").textContent = d3.format(",")(overviewCounts.get("known") || 0);
    document.getElementById("overview-conditional-count").textContent = d3.format(",")(overviewCounts.get("conditional") || 0);
    document.getElementById("overview-unknown-count").textContent = d3.format(",")(overviewCounts.get("unknown") || 0);

    renderPoints("map-1", list, {
      detailPanel: "detail-1",
      fillFn: f => ({
        known: COLORS.open,
        conditional: COLORS.conditional,
        unknown: COLORS.unknown
      })[overviewCategory(f)],
      strokeFn: "#ffffff"
    });
  }

  function renderFrame2() {
    const selected = state.frame2Visible;
    const list = facilities.filter(f => selected.has(availabilityAt(f)));

    const counts = countsByStatus(facilities);
    const metrics = [
      ["open","Listed open"],
      ["closed","Listed closed"],
      ["conditional","Conditional"],
      ["unknown","Hours unknown"]
    ];

    d3.select("#time-metrics")
      .selectAll(".metric-card")
      .data(metrics)
      .join("div")
      .attr("class", "metric-card")
      .html(([key,label]) => `<strong>${d3.format(",")(counts[key])}</strong><span>${label}</span>`);

    renderPoints("map-2", list, {
      detailPanel: "detail-2",
      statusFn: f => availabilityAt(f),
      fillFn: f => COLORS[availabilityAt(f)],
      strokeFn: f => hasScheduleQualification(f) && availabilityAt(f) === "open" ? COLORS.conditional : "#ffffff"
    });
  }

  function renderFrame3() {
    const filtered = frame3Filtered();
    document.getElementById("filter-result-count").textContent = d3.format(",")(filtered.length);

    renderPoints("map-3", filtered, {
      detailPanel: "detail-3",
      statusFn: f => availabilityAt(f),
      fillFn: f => COLORS[availabilityAt(f)],
      strokeFn: f => hasScheduleQualification(f) && availabilityAt(f) === "open" ? COLORS.conditional : "#ffffff"
    });
  }

  function renderWeeklyChart(list) {
    const data = DAYS.map(day => {
      const c = countsByStatus(list, day, state.minute);
      return { day, ...c };
    });

    const svg = d3.select("#weekly-chart");
    svg.selectAll("*").remove();

    const node = svg.node();
    const width = node.clientWidth || 680;
    const height = Math.max(140, node.clientHeight || 260);
    const compactLegend = width < 450;
    const margin = { top: 12, right: 14, bottom: compactLegend ? 62 : 38, left: 40 };
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const x = d3.scaleBand()
      .domain(DAYS)
      .range([margin.left, width - margin.right])
      .padding(.25);

    const y = d3.scaleLinear()
      .domain([0, Math.max(1, list.length)])
      .nice()
      .range([height - margin.bottom, margin.top]);

    const keys = ["open","closed","conditional","unknown"];
    const stack = d3.stack().keys(keys)(data);

    svg.append("g")
      .attr("class","grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat(""));

    svg.append("g")
      .selectAll("g")
      .data(stack)
      .join("g")
      .attr("fill", d => COLORS[d.key])
      .selectAll("rect")
      .data(d => d.map(v => Object.assign(v, { key: d.key })))
      .join("rect")
      .attr("x", d => x(d.data.day))
      .attr("y", d => y(d[1]))
      .attr("height", d => Math.max(0, y(d[0]) - y(d[1])))
      .attr("width", x.bandwidth())
      .on("mousemove", (event,d) => {
        const value = d.data[d.key];
        tooltip
          .style("opacity",1)
          .html(`<strong>${DAY_LABEL[d.data.day]}</strong>${STATUS_LABEL[d.key]}: ${d3.format(",")(value)}`)
          .style("left",`${event.clientX+12}px`)
          .style("top",`${event.clientY+12}px`);
      })
      .on("mouseleave", hideTooltip);

    svg.append("g")
      .attr("class","axis")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickFormat(d => DAY_LABEL[d].slice(0,3)).tickSizeOuter(0));

    svg.append("g")
      .attr("class","axis")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(",")));

    const legend = svg.append("g").attr("transform", `translate(${margin.left},${height - (compactLegend ? 28 : 8)})`);
    let offset = 0;
    keys.forEach((key, index) => {
      const xOffset = compactLegend ? (index % 2) * ((width - margin.left) / 2) : offset;
      const yOffset = compactLegend ? Math.floor(index / 2) * 18 : 0;
      const group = legend.append("g").attr("transform", `translate(${xOffset},${yOffset})`);
      group.append("rect").attr("width",9).attr("height",9).attr("y",-8).attr("fill",COLORS[key]).attr("rx",2);
      group.append("text").attr("x",13).attr("y",0).attr("font-size",10).attr("fill","#000").text(STATUS_LABEL[key]);
      offset += key === "conditional" ? 94 : 86;
    });
  }

  function renderFrame4() {
    const list = summaryFiltered();
    renderPoints("map-4", list, {
      fillFn: () => COLORS.open
    });
    renderWeeklyChart(list);
  }

  function renderActiveFrame() {
    if (state.frame === 1) renderFrame1();
    if (state.frame === 2) renderFrame2();
    if (state.frame === 3) renderFrame3();
    if (state.frame === 4) renderFrame4();
  }

  function switchFrame(frameNum) {
    hideTooltip();
    state.frame = frameNum;
    d3.selectAll(".frame").classed("active", false);
    d3.select(`#frame-${frameNum}`).classed("active", true);
    d3.selectAll(".frame-tab").classed("active", function() {
      return +this.dataset.frame === frameNum;
    });
    renderActiveFrame();
    if (frameNum <= 4) {
      setTimeout(() => maps[`map-${frameNum}`]?.map.invalidateSize(), 20);
    }
  }

  function setupControls() {
    setupDaySelects();
    setupTimeSliders();
    syncDayTimeControls();

    d3.selectAll(".frame-tab").on("click", function() {
      switchFrame(+this.dataset.frame);
    });

    const suggestions = d3.select("#facility-suggestions");
    d3.select("#overview-search").on("input", event => {
      state.overviewSearch = event.target.value;
      const term = normalizeSearch(state.overviewSearch);
      suggestions.selectAll("option")
        .data(term ? facilities.filter(f =>
          normalizeSearch(f.name).includes(term) ||
          normalizeSearch(f.operator).includes(term)
        ).slice(0, 20) : [])
        .join("option")
        .attr("value", f => f.name)
        .attr("label", f => f.operator || f.location_type || "Facility");
      if (state.frame === 1) renderFrame1();
    }).on("change", event => {
      const facility = facilities.find(f => normalizeSearch(f.name) === normalizeSearch(event.target.value));
      if (!facility) return;
      selectedFacilities["detail-1"] = facility.facility_id;
      renderFrame1();
      if (facility.mappable && Number.isFinite(facility.latitude) && Number.isFinite(facility.longitude)) {
        maps["map-1"].map.setView([facility.latitude, facility.longitude], 15);
      }
    });

    d3.select("#availability-checks-2").selectAll("input").on("change", function() {
      if (this.checked) state.frame2Visible.add(this.value);
      else state.frame2Visible.delete(this.value);
      renderFrame2();
    });

    d3.select("#accessibility-checks").selectAll("input").on("change", function() {
      if (this.checked) state.accessibility.add(this.value);
      else state.accessibility.delete(this.value);
      renderFrame3();
    });

    d3.select("#changing-filter").on("change", event => {
      state.changing = event.target.value;
      renderFrame3();
    });

    const types = Array.from(new Set(facilities.map(d => d.location_type).filter(Boolean))).sort();
    d3.select("#type-filter")
      .selectAll("option.dynamic")
      .data(types)
      .join("option")
      .attr("class","dynamic")
      .attr("value", d => d)
      .text(d => d);

    d3.select("#type-filter").on("change", event => {
      state.locationType = event.target.value;
      renderFrame3();
    });

    d3.select("#summary-population").selectAll("input").on("change", function() {
      if (this.checked) {
        state.summaryPopulation = this.value;
        renderFrame4();
      }
    });

    window.addEventListener("resize", () => {
      if (state.frame === 4) renderWeeklyChart(summaryFiltered());
    });
  }

  function init() {
    setupControls();
    // Overlay cards own their pointer events; exposed map areas remain interactive.
    document.querySelectorAll(".panel, .frame-heading, .header-meta").forEach(card => {
      L.DomEvent.disableClickPropagation(card);
      L.DomEvent.disableScrollPropagation(card);
    });
    renderFrame1();
  }

  init();
})();
