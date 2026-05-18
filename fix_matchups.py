c = open(r'C:\Users\chase\mlbma_pipeline\chase_analytics_mlb_oem_v7.html','r',encoding='utf-8').read()

section = (
    '<div class="section" id="matchupsSection" style="margin-top:20px;">'
    '<div class="section-header"><div>'
    '<div class="section-eyebrow">Daily Slate</div>'
    '<div class="section-title">Today\'s Projected Matchups</div>'
    '<div class="section-subtitle">Lineup OSI vs opposing starter handedness - Updated daily</div>'
    '</div></div>'
    '<div id="matchupsGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:14px;"></div>'
    '</div>'
)

if 'matchupsSection' not in c:
    c = c.replace('</body>', section + '</body>')
    open(r'C:\Users\chase\mlbma_pipeline\chase_analytics_mlb_oem_v7.html','w',encoding='utf-8').write(c)
    print('Added matchups section')
else:
    print('Already exists')