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


CARD = """<div class="p-card__injury"> <div class="tag">{tag}</div>
<div class="p-card__injury-data">Injury <b>Leg</b></div>
<div class="p-card__injury-data">Est. Return <b>10/20/2026</b></div> </div>"""


def test_card_reads_designation_injury_and_return():
    assert ci.parse_card(CARD.format(tag="Questionable")) == {
        "status": "Questionable", "injury": "Leg", "return": "10/20/2026"}
    assert ci.parse_card(CARD.format(tag="OFS"))["status"] == "Out For Season"
    assert ci.parse_card("<div class='p-card__player'>healthy</div>")["status"] is None


def test_qbs_are_checked_against_their_own_rotowire_card():
    """Covers had Delaware's Nick Minicucci Out; his RotoWire card read
    Questionable (leg), est. return 10/20/2026 (2026-10-20)."""
    merged = {"delaware": [
        {"player": "N. Minicucci", "position": "QB", "status": "Out", "source": "Covers"},
        {"player": "D. Lonergan", "position": "QB", "status": "Out", "source": "Covers"},
        {"player": "X. Unknown", "position": "QB", "status": "Out", "source": "Covers"},
        {"player": "G. Spiller", "position": "RB", "status": "Out", "source": "Covers"},
    ]}
    cards = {
        "N. Minicucci": {"status": "Questionable", "injury": "Leg", "return": "10/20/2026"},
        "D. Lonergan": {"status": None, "injury": None, "return": None},
    }
    asked = []

    def lookup(player, school, position):
        asked.append(player)
        return cards.get(player)

    counts = ci.verify(merged, lookup)
    rows = {e["player"]: e for e in merged["delaware"]}
    assert rows["N. Minicucci"]["status"] == "Questionable"
    assert rows["N. Minicucci"]["return"] == "10/20/2026"
    assert rows["N. Minicucci"]["source"] == "RotoWire + Covers"
    assert "D. Lonergan" not in rows                       # healthy on RotoWire
    assert rows["X. Unknown"]["status"] == "Out"           # card not found: kept as reported
    assert "G. Spiller" not in asked                       # only QBs are looked up
    assert counts == {"checked": 3, "confirmed": 0, "changed": 1, "cleared": 1, "unverified": 1}
    assert [e["status"] for e in merged["delaware"]] == ["Out", "Out", "Questionable"]


def test_name_key_matches_initials_and_drops_suffixes():
    assert ci._key("Rodney Tisdale Jr.") == ci._key("R. Tisdale") == "rtisdale"
