/** CBB research adapter: factual, versioned two-season exports only. */
(function (global) {
  'use strict';
  var ROOT = '/data/public/cbb/', cache = {}, baselines = {};
  function rememberIndex(value) { baselines=value.grade_baselines||{};return value; }
  function json(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('CBB evidence is unavailable (' + r.status + ').');
      return r.json();
    });
  }
  function context(year, id) {
    if (!/^\d{4}$/.test(String(year)) || !/^\d+$/.test(String(id))) return Promise.reject(new Error('Invalid team identity.'));
    var key = year + '/' + id;
    if (!cache[key]) cache[key] = json(ROOT + year + '/teams/' + id + '.json').catch(function (e) { delete cache[key]; throw e; });
    return cache[key];
  }
  function refreshFixtures(result,teams,slate) {
    var day=String(result.dateIso||'').replace(/-/g,'');
    if (!/^\d{8}$/.test(day)) return Promise.resolve(result);
    var url='/api/cbb-fixtures?date='+day;
    return json(url).then(function(payload){
      var observed=0;
      (payload.events||[]).forEach(function(event){
        var comp=(event.competitions||[])[0]||{},sides={};
        (comp.competitors||[]).forEach(function(c){sides[c.homeAway]=c;});
        if(!sides.home||!sides.away)return;
        var a=String(sides.away.team.id),h=String(sides.home.team.id);
        if(!teams[a]&&!teams[h])return;
        var type=(event.status||comp.status||{}).type||{},state=type.state;
        var nextState=/CANCEL/.test(type.name||'')?'canceled':/POSTPON/.test(type.name||'')?'postponed':/DELAY|SUSPEND/.test(type.name||'')?'delayed':state==='in'?'live':state==='post'?'final':'scheduled';
        var scored=nextState==='live'||nextState==='final';
        if(scored&&['away','home'].some(function(side){
          var score=sides[side].score;
          return score==null||score===''||!Number.isInteger(Number(score))||Number(score)<0;
        }))return;
        var g=result.games.find(function(x){return x.id===String(event.id);});
        if(!g){
          g={id:String(event.id),sport:'cbb',season:slate.season,slate_date:result.dateIso,away:a,home:h};
          ['away','home'].forEach(function(side){
            var id=side==='away'?a:h,meta=teams[id]||{},ident=meta.identity||{},source=sides[side].team||{};
            g[side+'_name']=ident.name||source.displayName;
            g[side+'_logo']=ident.logo||source.logo||null;
            g[side+'_color']=ident.color||source.color||null;
            g[side+'_summary']=(meta.seasons||{})[String(slate.season)]||{};g[side+'_evidence_seasons']=Object.keys(meta.seasons||{});
          });
          result.games.push(g);
        }
        if(String(g.away)!==a||String(g.home)!==h)return;
        if ((g.game_state === 'final' && nextState !== 'final') || (g.game_state === 'live' && nextState === 'scheduled')) return;
        g.game_state=nextState;
        g.kickoff_utc=event.date||g.kickoff_utc;g.venue=(comp.venue||{}).fullName||g.venue;
        g.venue_city=((comp.venue||{}).address||{}).city||g.venue_city;
        if(comp.neutralSite!=null)g.neutral=comp.neutralSite===true;
        ['away','home'].forEach(function(side){
          var c=sides[side],score=Number(c.score),record=(c.records||[]).find(function(r){return r.type==='total';});
          g[side+'_score']=scored?score:null;
          if(record&&record.summary)g[side+'_record']=record.summary;
          if(!g[side+'_logo']&&c.team.logo)g[side+'_logo']=c.team.logo;
          if(!g[side+'_color']&&c.team.color)g[side+'_color']=c.team.color;
        });
        observed++;
      });
      if(observed){result.statusObservedAt=new Date().toISOString();result.source='Basketball Quant season metrics · ESPN fixture status';}
      result.games.sort(function(a,b){return String(a.kickoff_utc).localeCompare(String(b.kickoff_utc))||a.id.localeCompare(b.id);});
      return result;
    }).catch(function(){return result;});
  }
  function load(date) {
    return Promise.all([json(ROOT + 'slate.json'), json(ROOT + 'teams.json')]).then(function (parts) {
      rememberIndex(parts[1]);
      var slate = parts[0], teams = parts[1].teams || {}, requested = new URLSearchParams(global.location.search).get('game');
      if (slate.sport !== 'cbb' || !Array.isArray(slate.games)) throw new Error('The CBB slate is malformed.');
      var today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      var selected = date || today;
      if (requested) {
        var target = slate.games.find(function (g) { return String(g.id) === requested; });
        if (target) selected = target.slate_date;
      }
      var games = slate.games.filter(function (g) { return g.slate_date === selected; }).map(function (g) {
        var row = {};
        ['id','sport','season','slate_date','game_state','kickoff_utc','away','home','away_name','home_name',
          'away_logo','home_logo','away_record','home_record','away_color','home_color','away_score','home_score',
          'venue','venue_city','broadcast','neutral','availability_summary'].forEach(function (key) { row[key] = g[key]; });
        ['away','home'].forEach(function (side) {
          row[side + '_summary'] = ((teams[g[side]] || {}).seasons || {})[String(slate.season)] || {};
          row[side + '_evidence_seasons'] = Object.keys((teams[g[side]] || {}).seasons || {});
        });
        return row;
      }).sort(function (a,b) { return String(a.kickoff_utc).localeCompare(String(b.kickoff_utc)) || a.id.localeCompare(b.id); });
      var result={ games: games, generatedAt: slate.generated_at_utc, dataThrough: slate.data_through_utc,
        dateIso: selected, source: 'Basketball Quant · two-season CBB evidence' };
      var checkAvailability = selected >= today;
      if (checkAvailability) games.forEach(function (game) { game.cbb_availability_pending = true; });
      var availability = checkAvailability ? json(ROOT + 'availability.json').catch(function () { return null; }) : Promise.resolve(null);
      result.statusReady = Promise.all([refreshFixtures(result,teams,slate), availability]).then(function(parts) {
        if (!checkAvailability) return result;
        result.availabilityChecked = true;
        result.games.forEach(function (game) { game.cbb_availability_pending = false; });
        var report = parts[1], stamp = report && Date.parse(report.retrieved_at_utc);
        if (!report || report.season !== slate.season || !Array.isArray(report.reports) ||
            !Number.isFinite(stamp) || Date.now() - stamp > 36 * 60 * 60 * 1000) return result;
        var byTeam = new Map();
        report.reports.forEach(function (row) {
          if (!byTeam.has(row.team_id)) byTeam.set(row.team_id, []);
          byTeam.get(row.team_id).push(row);
        });
        result.games.forEach(function (game) {
          game.cbb_availability_as_of = report.retrieved_at_utc;
          game.away_cbb_availability = byTeam.get(String(game.away)) || [];
          game.home_cbb_availability = byTeam.get(String(game.home)) || [];
        });
        return result;
      });
      return result;
    });
  }
  function detail(game) {
    function covered(year,side) { return (game[side+'_evidence_seasons']||[]).indexOf(String(year))<0 ? Promise.resolve(null) : context(year,game[side]).catch(function(){return null;}); }
    return Promise.all([covered(2027,'away'),covered(2027,'home'),covered(2026,'away'),covered(2026,'home'),
      json(ROOT+'tagged-schemes-2026.json').catch(function(){return null;})]).then(function (items) {
      game.away_cbb = items[0]; game.home_cbb = items[1];
      game.away_cbb_prior = items[2]; game.home_cbb_prior = items[3];
      game.cbb_tagged_schemes = items[4];
      return game;
    });
  }
  global.ChaseSportCBB = { load: load, context: context, detail: detail, SLATE_URL: ROOT + 'slate.json',
    baseline:function(year,group,key){return ((baselines[String(year)]||{})[group]||{})[key]||null;},
    teamIndex: function () { return json(ROOT + 'teams.json').then(rememberIndex); } };
})(typeof window !== 'undefined' ? window : this);
