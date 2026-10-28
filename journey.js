(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  $('game-invitation').hidden=false;
  $('dismiss-game-invitation').onclick=()=>{$('game-invitation').hidden=true;document.querySelector('.game-link-wrap a').focus();};
  $('search-home').append($('search-box'));
  if (!window.L || !window.d3 || !window.RESTROOM_DATA) {
    $('message').textContent = 'The map libraries could not load. Please connect to the internet and reload.';
    document.querySelectorAll('.locate, #search-submit, #explore-nyc').forEach(b => b.disabled = true);
    return;
  }
  const facilities = window.RESTROOM_DATA.facilities.filter(f => f.mappable && Number.isFinite(f.latitude) && Number.isFinite(f.longitude));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cityBounds = L.latLngBounds([40.477,-74.26],[40.918,-73.70]);
  const map = L.map('journey-map', {zoomControl:false, minZoom:10, maxZoom:19, maxBounds:cityBounds, maxBoundsViscosity:1}).setView([40.71,-73.98],11);
  function constrainMap(){
    map.setMinZoom(Math.max(10,map.getBoundsZoom(cityBounds,true)));
    map.panInsideBounds(cityBounds,{animate:false});
  }
  map.on('resize',constrainMap);
  constrainMap();
  const zoom = L.control.zoom({position:'topleft'}).addTo(map);
  zoom.getContainer().style.marginTop = '80px';
  map.attributionControl.setPosition('topright');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  L.svg().addTo(map);
  const dots = d3.select(map.getPanes().overlayPane).select('svg g').selectAll('circle').data(facilities).join('circle').attr('r',3).attr('fill','#173c38').attr('fill-opacity',0.45).attr('stroke','white').attr('stroke-width',0.5).style('pointer-events','none');
  function plot(){dots.attr('cx', f => map.latLngToLayerPoint([f.latitude,f.longitude]).x).attr('cy', f => map.latLngToLayerPoint([f.latitude,f.longitude]).y).attr('opacity',map.getZoom()<9 ? 0 : 1);}
  map.on('zoomend moveend',plot); plot();
  let origin, originMarker, nearest=[], selected=null, markers=[], requestId=0;
  const human = value => (value || '').replaceAll('_',' ').replace(/^./, c=>c.toUpperCase());
  function covered(lat,lon){return lat>=40.477 && lat<=40.918 && lon>=-74.26 && lon<=-73.70;}
  function message(text){$('message').textContent=text;}
  let routeLayer, routeController, routeTimer, routeVersion=0, lastRouteRequest=0;
  const routeCache=new Map();
  function clearRoute(){
    ++routeVersion;clearTimeout(routeTimer);routeController?.abort();
    if(routeLayer){map.removeLayer(routeLayer);routeLayer=null;}
    $('route-panel').hidden=true;$('route-steps').replaceChildren();
  }
  function placeDirections(expanded){
    const docked=expanded&&innerWidth>1000;
    $('route-panel').classList.toggle('docked',docked);
    if(docked)$('workspace').append($('route-panel'));
    else $('sheet-content').insertBefore($('route-panel'),$('cards'));
    $('route-details').open=expanded;
    if(expanded){$('sheet-content').hidden=false;$('sheet-toggle').setAttribute('aria-expanded','true');}
  }
  $('route-close').onclick=()=>{$('route-panel').hidden=true;document.querySelector('.bathroom-card.selected .directions')?.focus();};
  function showRoute(f,focusRoute=false){
    clearRoute();placeDirections(focusRoute);const version=routeVersion;const from=origin;
    $('route-panel').hidden=false;$('route-title').textContent='Walking to '+f.name;
    $('route-status').textContent='Finding a walking route…';
    const key=`${from.lat},${from.lng}:${f.facility_id}`;
    function display(data){
      if(version!==routeVersion)return;
      const route=data.routes[0];
      routeLayer=L.geoJSON(route.geometry,{style:{color:'#2068b1',weight:6,opacity:0.95},interactive:false}).addTo(map);
      const mobile=innerWidth<=760;
      if(focusRoute){$('route-panel').focus({preventScroll:true});if(innerWidth<=1000)$('route-panel').scrollIntoView({block:'nearest',behavior:'auto'});}
      map.stop();map.fitBounds(routeLayer.getBounds().extend(from).extend([f.latitude,f.longitude]),{paddingTopLeft:[35,85],paddingBottomRight:mobile?[35,Math.round(map.getSize().y*.58)+20]:[focusRoute&&innerWidth>1000?780:440,55],maxZoom:focusRoute?18:17,animate:!reduced.matches});
      $('route-status').textContent=`About ${Math.max(1,Math.ceil(route.duration/60))} min walk · ${(route.distance/1000).toFixed(2)} km along the route`;
      const list=$('route-steps');list.replaceChildren();
      for(const step of route.legs.flatMap(leg=>leg.steps||[])){
        const li=document.createElement('li');const m=step.maneuver;
        const action=m.type==='depart'?'Start walking':m.type==='arrive'?'Arrive near the listed bathroom location':`${human(m.type)}${m.modifier?' '+m.modifier:''}`;
        li.textContent=action+(step.name?' · '+step.name:'')+(step.distance>0?` - ${Math.round(step.distance)} m`:'');list.append(li);
      }
      if(!focusRoute)$('route-panel').scrollIntoView({block:'nearest',behavior:'auto'});
      const eta=document.querySelector('.bathroom-card.selected .eta');
      if(eta)eta.textContent=`About ${Math.max(1,Math.ceil(route.duration/60))} min walk · ${(route.distance/1000).toFixed(2)} km route`;
    }
    if(routeCache.has(key)){display(routeCache.get(key));return;}
    routeTimer=setTimeout(async()=>{
      const controller=new AbortController();routeController=controller;
      const timeout=setTimeout(()=>controller.abort(),20000);lastRouteRequest=Date.now();
      try{
        const coords=`${from.lng},${from.lat};${f.longitude},${f.latitude}`;
        const response=await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&radiuses=100;100`,{signal:controller.signal});
        if(!response.ok)throw new Error('routing');const data=await response.json();const route=data.routes?.[0];
        if(data.code!=='Ok'||route?.geometry?.type!=='LineString'||!route.geometry.coordinates?.length||!Number.isFinite(route.duration)||!Number.isFinite(route.distance))throw new Error('no route');
        if(version!==routeVersion)return;
        if(routeCache.size>=20)routeCache.delete(routeCache.keys().next().value);
        routeCache.set(key,data);display(data);
      }catch(error){if(version===routeVersion)$('route-status').textContent='Walking route unavailable. Choose this route again to retry, or select another bathroom.';}
      finally{clearTimeout(timeout);}
    },Math.max(150,1100-(Date.now()-lastRouteRequest)));
  }
  function start(lat,lon,label){
    if(!covered(lat,lon)){message('This project covers New York City only. Enter a NYC location or choose Explore NYC.');return;}
    cancelSearch();
    $('search-submit').disabled=false;
    document.querySelectorAll('.locate').forEach(b=>b.disabled=false);
    clearRoute();origin = L.latLng(lat,lon);
    document.body.classList.add('exploring'); $('welcome').hidden=true; $('workspace').hidden=false;
    $('search-away').append($('search-box')); $('search-box').hidden=true; $('search-choices').replaceChildren(); message('');
    $('origin-label').textContent='Starting from '+label;
    $('sheet-content').hidden=false; $('sheet-toggle').setAttribute('aria-expanded','true');
    if(originMarker) originMarker.remove();
    originMarker=L.marker(origin,{icon:L.divIcon({className:'origin-pin',iconSize:[16,16]}),title:'Starting point',keyboard:true}).addTo(map).bindTooltip('Starting point');
    nearest=facilities.map(f=>({f,distance:origin.distanceTo([f.latitude,f.longitude])})).sort((a,b)=>a.distance-b.distance).slice(0,4);
    selected=null;
    markers.forEach(m=>m.remove()); markers=[];
    nearest.forEach(({f},i)=>{
      const marker=L.marker([f.latitude,f.longitude],{icon:pin(i,f.facility_id===selected),title:`${i+1}. ${f.name}`,keyboard:true}).addTo(map).on('click',()=>select(f.facility_id,true));
      markers.push(marker);
    });
    render(); map.invalidateSize();
    const bounds=L.latLngBounds([origin,...nearest.map(({f})=>[f.latitude,f.longitude])]);
    const mobile=innerWidth<=760;
    map.flyToBounds(bounds,{paddingTopLeft:[45,85],paddingBottomRight:mobile?[45,Math.round(map.getSize().y*.58)+20]:[440,70],maxZoom:16,duration:reduced.matches?0:1.6,animate:!reduced.matches});
    $('results').focus({preventScroll:true});
  }
  function pin(i,active){return L.divIcon({className:'number-pin'+(active?' active':''),html:String(i+1),iconSize:[34,34],iconAnchor:[17,17]});}
  function select(id,fromMap){selected=id; render(); showRoute(nearest.find(item=>item.f.facility_id===id).f); markers.forEach((m,i)=>m.setIcon(pin(i,nearest[i].f.facility_id===id))); if(fromMap){$('sheet-content').hidden=false;$('sheet-toggle').setAttribute('aria-expanded','true');document.querySelector('.bathroom-card.selected')?.scrollIntoView({block:'nearest',behavior:'auto'});}}
  function render(){
    $('cards').replaceChildren(); $('empty').hidden=nearest.length>0;
    nearest.forEach(({f,distance},i)=>{
      const card=document.createElement('article');card.className='bathroom-card'+(selected===f.facility_id?' selected':'');
      const button=document.createElement('button');button.className='card-select';button.setAttribute('aria-expanded',String(selected===f.facility_id));
      const num=document.createElement('span');num.className='number';num.textContent=i+1;
      const content=document.createElement('span');
      for(const [cls,text] of [['card-title',f.name],['card-meta',`${f.location_type} · ${f.operator}`],['eta',`≈ ${Math.max(1,Math.ceil(distance/80))} min walk · ${(distance/1000).toFixed(2)} km straight-line`]]){const s=document.createElement('span');s.className=cls;s.textContent=text;content.append(s);}
      button.append(num,content);button.onclick=()=>{select(f.facility_id,false);document.querySelector('.bathroom-card.selected .card-select')?.focus({preventScroll:true});}; card.append(button);
      if(selected===f.facility_id){
        const detail=document.createElement('div');detail.className='card-detail';
        const paragraphs=[`Location: ${f.location_type}, operated by ${f.operator}. Street address not supplied; the map uses the source coordinates.`,f.schedule?.raw_hours?`Listed hours: ${f.schedule.raw_hours}`:'Hours unavailable',f.accessibility?.raw?`Source accessibility: ${f.accessibility.raw}`:'Accessibility not documented',`Season: ${human(f.seasonality)||'Not documented'}`,f.changing_station?.any==='unknown'?'Changing station: not documented':`Changing station: ${human(f.changing_station?.any)||'Not documented'}`,f.additional_notes];
        for(const text of paragraphs.filter(Boolean)){const p=document.createElement('p');p.textContent=text;detail.append(p);}
        const choose=document.createElement('button');choose.type='button';choose.className='directions';choose.textContent='Choose this route';
        choose.onclick=()=>showRoute(f,true);detail.append(choose);card.append(detail);
      }
      $('cards').append(card);
    });
  }
  $('explore-nyc').onclick=()=>start(40.7308,-73.9973,'Washington Square Park · NYC example');
  document.querySelectorAll('.locate').forEach(button=>button.onclick=()=>{
    $('search-box').hidden=false;
    if(!navigator.geolocation){message('Location is unavailable in this browser. Enter an address or explore NYC.');return;}
    cancelSearch();clearSuggestions();const id=++requestId;message('Waiting for location permission…');
    document.querySelectorAll('.locate').forEach(b=>b.disabled=true);
    navigator.geolocation.getCurrentPosition(p=>{if(id!==requestId)return;document.querySelectorAll('.locate').forEach(b=>b.disabled=false);start(p.coords.latitude,p.coords.longitude,`your location (accuracy about ${Math.round(p.coords.accuracy)} m)`);},error=>{if(id!==requestId)return;document.querySelectorAll('.locate').forEach(b=>b.disabled=false);message(error.code===1?'Location permission was denied. Enter an address or explore NYC instead.':'Could not get your location. Enter an address or explore NYC instead.');},{enableHighAccuracy:false,timeout:12000,maximumAge:60000});
  });
  let searchTimer, activeSearch;
  const searchCache=new Map();
  function cancelSearch(){clearTimeout(searchTimer);activeSearch?.abort();++requestId;$('search-submit').disabled=false;}
  function clearSuggestions(){$('search-choices').replaceChildren();}
  async function searchPlaces(){
    const q=$('place').value.trim();if(q.length<3){message('Type at least 3 characters to find a location.');return;}
    const id=++requestId;activeSearch?.abort();document.querySelectorAll('.locate').forEach(b=>b.disabled=false);clearSuggestions();message('Finding places…');
    const controller=new AbortController();activeSearch=controller;const timer=setTimeout(()=>controller.abort(),20000);
    try{
      let data=searchCache.get(q.toLowerCase());
      if(!data){
        const response=await fetch('https://photon.komoot.io/api/?'+new URLSearchParams({q,lat:'40.73',lon:'-73.98',limit:'5',bbox:'-74.26,40.477,-73.70,40.918'}),{signal:controller.signal});
        if(!response.ok)throw new Error('search');data=await response.json();
        if(searchCache.size>=30)searchCache.delete(searchCache.keys().next().value);
        searchCache.set(q.toLowerCase(),data);
      }
      if(id!==requestId)return;
      const choices=(data.features||[]).filter(f=>f.geometry?.type==='Point'&&covered(f.geometry.coordinates[1],f.geometry.coordinates[0]));
      if(!choices.length){message('No NYC matches found. Try a fuller address with “New York,” or Explore NYC.');return;}
      message('Choose a location above the search field.');
      choices.forEach(f=>{const p=f.properties;const label=[p.name,[p.housenumber,p.street].filter(Boolean).join(' '),p.city,p.postcode].filter(Boolean).join(', ')||'NYC location';const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{cancelSearch();start(f.geometry.coordinates[1],f.geometry.coordinates[0],label);};$('search-choices').append(b);});
    }catch(error){if(id===requestId)message('Address search is unavailable right now. Try your location or Explore NYC.');}
    finally{clearTimeout(timer);if(activeSearch===controller)activeSearch=null;}
  }
  $('place').addEventListener('input',()=>{cancelSearch();clearSuggestions();message('');const q=$('place').value.trim();if(q.length>=3){if(searchCache.has(q.toLowerCase()))searchPlaces();else searchTimer=setTimeout(searchPlaces,250);}});
  $('search-form').onsubmit=event=>{event.preventDefault();cancelSearch();searchPlaces();};
  $('place').addEventListener('keydown',event=>{
    if(event.key==='Escape'){cancelSearch();clearSuggestions();message('');}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){const buttons=$('search-choices').querySelectorAll('button');if(buttons.length){event.preventDefault();buttons[event.key==='ArrowDown'?0:buttons.length-1].focus();}}
  });
  $('search-choices').addEventListener('keydown',event=>{
    const buttons=[...$('search-choices').querySelectorAll('button')];const index=buttons.indexOf(document.activeElement);
    if(event.key==='Escape'){cancelSearch();clearSuggestions();message('');$('place').focus();}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const next=index+(event.key==='ArrowDown'?1:-1);if(next<0||next>=buttons.length)$('place').focus();else buttons[next].focus();}
  });
  $('change').onclick=()=>{$('search-box').hidden=!$('search-box').hidden;if(!$('search-box').hidden)$('place').focus();};
  $('search-area').onclick=()=>{const c=map.getCenter();$('search-box').hidden=false;start(c.lat,c.lng,`map center (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`);};
  $('return').onclick=()=>{window.location.assign('index.html');};
  $('sheet-toggle').onclick=()=>{const open=$('sheet-toggle').getAttribute('aria-expanded')==='true';$('sheet-toggle').setAttribute('aria-expanded',String(!open));$('sheet-content').hidden=open;};
  addEventListener('resize',()=>{if(!$('route-panel').hidden)placeDirections($('route-details').open);if(innerWidth>760){$('sheet-content').hidden=false;$('sheet-toggle').setAttribute('aria-expanded','true');}});
})();














