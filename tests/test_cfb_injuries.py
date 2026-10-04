"""CFB injury reports: Covers parse, RotoWire upgrade, ordering."""
import json

from scripts import cfb_injuries as ci

COVERS = """
<a id="Western Kentucky"></a>
<section><table><tbody>
<tr><td><span class='player-link'>A.  Boyd</span></td><td>RB</td>
<td><b>Questionable - Undisclosed</b><br>(Sun, Sep 27)</td><td></td></tr>
<tr class="collapse"><td colspan="4"><div class="col-xs-12 covers-CoversMatchups-injuryCopy">
Boyd is dealing with an injury.</div></td></tr>
<tr><td><span class='player-link'>G. Reimer</span></td><td>TE</td>
<td><b>Out - Knee</b><br>(Mon, Sep 28)</td><td></td></tr>
</tbody></table></section>
<a id="Akron"></a>
<section><table><tbody></tbody></table></section>
"""


def test_covers_parse_reads_status_reason_date_and_detail():
    out = ci.parse_covers(COVERS)
    wku = out["westernkentucky"]
    assert [e["player"] for e in wku] == ["A. Boyd", "G. Reimer"]
    assert wku[0]["status"] == "Questionable" and wku[0]["injury"] == "Undisclosed"
    assert wku[0]["updated"] == "Sun, Sep 27"
    assert wku[0]["detail"] == "Boyd is dealing with an injury."
    assert out["akron"] == []          # a school with nobody listed is still reported


def test_rotowire_upgrades_the_matching_covers_row_and_out_sorts_first():
    covers = ci.parse_covers(COVERS)
    roto = ci.parse_rotowire(json.dumps([{"player": "Adrion Boyd", "RotoSchoolName": "Western Kentucky",
                                          "IR": "Out", "position": "RB", "injury_type": "Undisclosed",
                                          "ReturnDate": "Oct 8th", "date": "Oct 1 8:00 PM"}]))
    merged = ci.merge(covers, roto)["westernkentucky"]
    boyd = next(e for e in merged if e["player"] == "Adrion Boyd")
    assert boyd["status"] == "Out" and boyd["return"] == "Oct 8th"
    assert boyd["source"] == "RotoWire + Covers"
    assert len(merged) == 2 and all(e["status"] == "Out" for e in merged)


def test_name_key_matches_initials_and_drops_suffixes():
    assert ci._key("Rodney Tisdale Jr.") == ci._key("R. Tisdale") == "rtisdale"
