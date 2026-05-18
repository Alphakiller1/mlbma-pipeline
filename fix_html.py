with open(r'C:\Users\chase\mlbma_pipeline\chase_analytics_mlb_oem_v7.html', 'r', encoding='utf-8') as f:
    content = f.read()

oor_html = (
    '<div class="section" id="oorSection" style="margin-top:20px;">'
    '<div class="section-header"><div>'
    '<div class="section-eyebrow">Opponent Context</div>'
    '<div class="section-title">OOR — Opponent Offensive Rating</div>'
    '<div class="section-subtitle">How dangerous is the offense each team faces? Red = toughest. Green = softest.</div>'
    '</div></div>'
    '<div class="table-wrap"><table>'
    '<thead><tr><th>#</th><th>Team</th><th>HvP</th><th>HvL</th><th>HvR</th><th>vP%</th><th>vP Rank</th><th>vL Rank</th><th>vR Rank</th></tr></thead>'
    '<tbody id="oorTableBody"><tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:20px;">Loading OOR data...</td></tr></tbody>'
    '</table></div></div>'

    '<div class="section" id="pitchingSection" style="margin-top:20px;">'
    '<div class="section-header"><div>'
    '<div class="section-eyebrow">Pitching Context</div>'
    '<div class="section-title">Pitching Score</div>'
    '<div class="section-subtitle">Team pitching quality: K%, BB%, HR/9. Higher = stronger staff.</div>'
    '</div></div>'
    '<div class="table-wrap"><table>'
    '<thead><tr><th>#</th><th>Team</th><th>K%</th><th>BB%</th><th>HR/9</th><th>PitchScore</th></tr></thead>'
    '<tbody id="pitchingTableBody"><tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:20px;">Loading pitching data...</td></tr></tbody>'
    '</table></div></div>'

    '<div class="section" id="matchupsSection" style="margin-top:20px;">'
    '<div class="section-header"><div>'
    '<div class="section-eyebrow">Daily Slate</div>'
    '<div class="section-title">Today\'s Projected Matchups</div>'
    '<div class="section-subtitle">Lineup OSI vs opposing starter handedness - Updated daily</div>'
    '</div></div>'
    '<div id="matchupsGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:14px;"></div>'
    '</div>'

    '<div class="section" style="margin-top:20px;margin-bottom:40px;">'
    '<div class="section-header"><div>'
    '<div class="section-eyebrow">Coming Soon</div>'
    '<div class="section-title">PALS - Pitching-Adjusted Lineup Score</div>'
    '<div class="section-subtitle">OSI adjusted for the quality of pitching the lineup has faced.</div>'
    '</div>'
    '<span class="pill" style="background:var(--gold-dim);color:var(--gold);border:1px solid rgba(251,191,36,0.3);">In Development</span>'
    '</div>'
    '<div class="onboarding-grid">'
    '<div class="education-card"><strong>What PALS measures</strong><br>Whether a lineup\'s OSI is genuine or inflated by weak pitching schedule.</div>'
    '<div class="education-card"><strong>Formula</strong><br>PALS = (BA++ + PTF+) / 2</div>'
    '<div class="education-card"><strong>Data needed</strong><br>Game log linked to opposing SP SIERA. In progress.</div>'
    '<div class="education-card"><strong>Betting application</strong><br>Tells you if tonight\'s lineup is over or under-valued by schedule.</div>'
    '</div></div>'
)

if 'oorSection' not in content:
    content = content.replace('</body>', oor_html + '</body>')
    print("Added HTML sections")
else:
    print("HTML sections already exist")

with open(r'C:\Users\chase\mlbma_pipeline\chase_analytics_mlb_oem_v7.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")