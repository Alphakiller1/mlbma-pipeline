f = open(r'C:\Users\chase\mlbma_pipeline\chase_analytics_mlb_oem_v7.html','r',encoding='utf-8')
c = f.read()
f.close()
old = 'rows.sort(function(a, b) { return (b.pitchScore || 0) - (a.pitchScore || 0); });'
new = 'LIVE_DATA.pitching=LIVE_DATA.pitching.map(function(r){if(r.pitchScore!==undefined)return r;return{t:r.Tm,pitchScore:parseFloat(r.PitchScore),kPct:parseFloat(r["K%"]),bbPct:parseFloat(r["BB%"]),hr9:parseFloat(r["HR/9"])};});rows=LIVE_DATA.pitching.slice();rows.sort(function(a,b){return(b.pitchScore||0)-(a.pitchScore||0);});'
print("Found:", old in c)
c = c.replace(old, new, 1)
f = open(r'C:\Users\chase\mlbma_pipeline\chase_analytics_mlb_oem_v7.html','w',encoding='utf-8')
f.write(c)
f.close()
print("Done")