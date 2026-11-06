/** Shared CBB court primitive for matchup analysis and the comparison tool. */
(function (global) {
  'use strict';
  var PATH = {atb3:'M0 0H500V470H0Z',mid2:'M33.44 0L33.44 98.81A221.46 221.46 0 0 0 466.56 98.81L466.56 0Z',
    c3:'M0 0H33.44V98.81H0Z M466.56 0H500V98.81H466.56Z',paint2:'M190 0H310V190H190Z',
    atr2:'M295 52.5A45 45 0 1 0 205 52.5A45 45 0 1 0 295 52.5Z'};
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function pct(v) { return v == null ? '—' : (100 * v).toFixed(1) + '%'; }
  function pp(v) { return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + ' pp'; }
  function grade(v,defense) { if (v == null) return 'c-na'; v = defense ? -v : v; return v >= 8 ? 'c-elite' : v >= 3 ? 'c-good' : v <= -8 ? 'c-poor' : v <= -3 ? 'c-weak' : 'c-mid'; }
  function court(profile,title,options) {
    options = options || {};
    if (!profile || !profile.totals.attempts) return '<p class="ca-cbb-note">Shot coverage is not available for this evidence window.</p>';
    var by = {}, share = options.metric === 'share'; profile.zones.forEach(function(z){by[z.id]=z;});
    var zones = ['atb3','mid2','c3','paint2','atr2'].map(function(id){
      var z = by[id], tone = z.attempts && !share ? grade(z.delta_pp,options.defense) : 'c-na';
      var style = share && z.attempts ? ' style="fill:var(--viz-away);fill-opacity:' + (.18 + .72 * Math.sqrt(z.shot_share)) + '"' : '';
      return '<path class="ca-court-zone ' + tone + '" d="' + PATH[id] + '"' + style + ' tabindex="0"><title>' +
        esc(z.label + ': ' + pct(z.fg_pct) + ', ' + z.made + '/' + z.attempts + '; share ' + pct(z.shot_share) + '; D-I ' + pct(z.league_fg_pct) + '; ' + pp(z.delta_pp)) + '</title></path>';
    }).join('');
    function badge(id,x,y,rotate) {
      var z = by[id]; return '<g class="ca-court-badge' + (rotate ? ' ca-cbb-corner' : '') + '" transform="translate(' + x + ' ' + y + ')' + (rotate ? ' rotate(90)' : '') + '"><rect x="' + (rotate ? -40 : -55) + '" y="' + (rotate ? -18 : -28) + '" width="' + (rotate ? 80 : 110) + '" height="' + (rotate ? 36 : 56) + '" rx="7"></rect><text class="ca-court-badge__big" y="-2">' +
        (share ? pct(z.shot_share) : pct(z.fg_pct)) + '</text><text class="ca-court-badge__small" y="' + (rotate ? 14 : 20) + '">' +
        (share ? z.attempts + ' FGA' : z.made + '/' + z.attempts) + '</text></g>';
    }
    return '<figure class="ca-court ca-cbb-court"><svg viewBox="0 0 500 ' + (options.compact ? 380 : 470) + '" role="img" aria-label="' + esc(title) + '"><rect class="ca-court-floor" width="500" height="470"></rect>' + zones +
      '<g class="ca-court-lines" aria-hidden="true"><rect x="1" y="1" width="498" height="468"></rect><rect x="190" y="1" width="120" height="189"></rect><circle cx="250" cy="190" r="60"></circle><path d="M33.44 1L33.44 98.81A221.46 221.46 0 0 0 466.56 98.81L466.56 1"></path><line x1="220" y1="40" x2="280" y2="40"></line><circle class="ca-court-rim" cx="250" cy="52.5" r="7.5"></circle></g>' +
      badge('atr2',250,98) + badge('paint2',250,165) + badge('mid2',250,253) + badge('atb3',250,options.compact ? 330 : 362) + badge('c3',480,54,true) + '</svg><figcaption>' +
      (share ? 'Share of FGA · attempts' : 'Zone FG% · makes/attempts') + ' · ' + esc(by.heave3.label) + ' ' + by.heave3.made + '/' + by.heave3.attempts + '</figcaption></figure>';
  }
  function legend(defense,metric) {
    if (metric === 'share') return '<p class="ca-cbb-legend">Fill intensity shows frequency.</p>';
    return '<div class="ca-cbb-legend"><span>Zone FG% vs same-season D-I average</span><div class="ca-cbb-legend__ramp"></div><div class="ca-cbb-legend__labels"><span>' + (defense ? '+10 pp allowed' : '−10 pp') + '</span><span>D-I average</span><span>' + (defense ? '−10 pp allowed' : '+10 pp') + '</span></div></div>';
  }
  global.ChaseCbbCharts = { court:court,legend:legend,pct:pct,pp:pp,esc:esc };
})(typeof window !== 'undefined' ? window : this);
