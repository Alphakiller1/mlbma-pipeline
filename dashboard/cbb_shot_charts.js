/** Six-team research tool. Courts share the matchup primitive and source definitions. */
(function(global){
  'use strict';
  var host=document.getElementById('cbbShotMatrix'),status=document.getElementById('cbbChartStatus'),chart=global.ChaseCbbCharts;
  if(!host||!chart)return;
  var ids=['96','150','127','12','2305','2509'],year=2027,metric='fg',view='offense',teams={},serial=0;
  function options(kind,items,value){return '<div class="ca-cbb-options" role="group" aria-label="'+kind+'">'+items.map(function(x){return '<button type="button" data-chart-'+kind+'="'+x[0]+'" class="'+(String(value)===x[0]?'is-on':'')+'" aria-pressed="'+(String(value)===x[0])+'">'+x[1]+'</button>';}).join('')+'</div>';}
  function render(){
    var token=++serial;
    document.getElementById('cbbChartControls').innerHTML=options('season',[['2027','2026–27'],['2026','2025–26']],year)+options('metric',[['fg','FG%'],['share','Shot share']],metric)+options('view',[['offense','Offense'],['defense','Opponent allowed']],view);
    status.textContent='Loading selected team evidence…';host.setAttribute('aria-busy','true');
    Promise.all(ids.map(function(id){return global.ChaseSportCBB.context(year,id).catch(function(){return null;});})).then(function(contexts){
      if(token!==serial)return;
      var schema=contexts.every(function(c){return c&&c.shots.cbb;})?'cbb':'coordinates';
      host.innerHTML=contexts.map(function(c,i){
        var list=Object.keys(teams).filter(function(id){return teams[id].seasons[String(year)];}).sort(function(a,b){return teams[a].identity.name.localeCompare(teams[b].identity.name);});
        var select='<select class="ca-cbb-select" data-chart-team="'+i+'" aria-label="Team '+(i+1)+'">'+list.map(function(id){return '<option value="'+id+'"'+(id===ids[i]?' selected':'')+'>'+chart.esc(teams[id].identity.name)+'</option>';}).join('')+'</select>';
        if(!c)return '<article class="ca-matchup-card ca-cbb-matrix-card">'+select+'<p class="ca-cbb-note">This team has no evidence in the selected season.</p></article>';
        var p=c.shots[schema][view],t=p.totals;
        return '<article class="ca-matchup-card ca-cbb-matrix-card">'+select+'<div class="ca-cbb-matrix-title"><img src="'+chart.esc(c.identity.logo)+'" width="40" height="40" alt=""><div><h2>'+chart.esc(c.identity.name)+'</h2><p>'+ (year===2027?'2026–27':'2025–26')+' · '+(view==='offense'?'Offense':'Defense allowed')+' · '+t.games+' '+(t.games===1?'game':'games')+'</p></div></div>'+chart.court(p,c.identity.name,{compact:true,defense:view==='defense',metric:metric})+chart.legend(view==='defense',metric)+
          '<div class="ca-cbb-summary"><span><strong>'+t.made+'/'+t.attempts+'</strong> FGM/FGA</span><span><strong>'+chart.efg(p,view==='defense')+'</strong> eFG</span></div><p class="ca-cbb-note">Through '+chart.esc(t.data_through||'not published')+(year===2027?' · Early-season sample':'')+'</p></article>';
      }).join('');
      status.textContent=(schema==='cbb'?'CBB Analytics six-zone definitions.':'Chase coordinate zones from Basketball Quant. Event coverage can differ from box scores.')+' Every selected team uses the same definitions and same-season D-I baseline.';
      host.setAttribute('aria-busy','false');
    }).catch(function(){status.textContent='The selected evidence could not be loaded.';host.setAttribute('aria-busy','false');});
  }
  document.addEventListener('click',function(e){var b=e.target.closest('[data-chart-season],[data-chart-metric],[data-chart-view]');if(!b)return;if(b.dataset.chartSeason)year=Number(b.dataset.chartSeason);if(b.dataset.chartMetric)metric=b.dataset.chartMetric;if(b.dataset.chartView)view=b.dataset.chartView;render();});
  host.addEventListener('change',function(e){var n=e.target.dataset.chartTeam;if(n==null)return;ids[Number(n)]=e.target.value;render();});
  global.ChaseSportCBB.teamIndex().then(function(p){teams=p.teams||{};render();}).catch(function(){status.textContent='The team index could not be loaded.';});
})(window);
