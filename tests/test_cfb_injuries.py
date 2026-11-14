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
        "status": "Questionable", "injury": "Leg", "return": "2026-10-20"}   # ISO: the page writes "Oct 20"
    assert ci.parse_card(CARD.format(tag="OFS"))["status"] == "Out For Season"
    assert ci.parse_card("<div class='p-card__player'>healthy</div>")["status"] is None


def test_qbs_are_checked_against_their_own_rotowire_card():
    """Covers had Delaware's Nick Minicucci Out; his RotoWire card read
    Questionable (leg), est. return 10/20/2026 (2026-10-20)."""
    merged = {"delaware": [
        {"player": "N. Minicucci", "position": "QB", "status": "Out", "source": "Covers",
         "detail": "Minicucci will miss an undetermined length of time."},
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
    assert "detail" not in rows["N. Minicucci"]             # Covers' note no longer applies
    assert "D. Lonergan" not in rows                       # healthy on RotoWire
    assert rows["X. Unknown"]["status"] == "Out"           # card not found: kept as reported
    assert "G. Spiller" not in asked                       # only QBs are looked up
    assert counts == {"checked": 3, "confirmed": 0, "changed": 1, "cleared": 1, "unverified": 1}
    assert [e["status"] for e in merged["delaware"]] == ["Out", "Out", "Questionable"]


def test_name_key_matches_initials_and_drops_suffixes():
    assert ci._key("Rodney Tisdale Jr.") == ci._key("R. Tisdale") == "rtisdale"


def test_covers_dates_take_the_year_whose_weekday_matches():
    from datetime import date
    assert ci.covers_date("Sat, Oct 17", date(2026, 11, 12)) == date(2026, 10, 17)
    assert ci.covers_date("Tue, Dec 30", date(2026, 11, 12)) == date(2025, 12, 30)
    assert ci.covers_date("Nov 12 8:00 PM", date(2026, 11, 12)) is None


def test_designations_past_their_game_expire():
    # Owner 2026-11-12: Covers' college page stopped updating around Oct 21
    # and the desk still showed October Questionable tags in November.
    from datetime import date
    merged = {"memphis": [
        {"player": "B. Kluse", "status": "Questionable", "updated": "Sat, Oct 17", "source": "Covers",
         "detail": "unclear whether he will play against East Carolina on Thursday."},
        {"player": "L. Szarka", "status": "Out", "injury": "Leg", "updated": "Mon, Oct 5", "source": "Covers",
         "detail": "has been shut down for the remainder of the season."},
        {"player": "C. Cole", "status": "Out", "injury": "Undisclosed", "updated": "Sat, Oct 10", "source": "Covers",
         "detail": "will miss Saturday's game."},
        {"player": "R. Ir", "status": "IR", "updated": "Tue, Aug 11", "source": "Covers"},
        {"player": "M. Fresh", "status": "Questionable", "updated": "Tue, Nov 10", "source": "Covers"},
        {"player": "Michael Van Buren", "status": "Questionable", "updated": "Nov 12 8:00 PM", "source": "RotoWire"},
    ]}
    assert ci.expire(merged, date(2026, 11, 12)) == 2
    assert [e["player"] for e in merged["memphis"]] == ["L. Szarka", "R. Ir", "M. Fresh", "Michael Van Buren"]


def test_return_dates_read_every_rotowire_form():
    from datetime import date
    today = date(2026, 11, 14)
    assert ci.return_date("Nov 21st", today) == date(2026, 11, 21)
    assert ci.return_date("Mar 1st", today) == date(2027, 3, 1)      # next spring, not last
    assert ci.return_date("Oct 8th", today) == date(2026, 10, 8)     # recent past stays past
    assert ci.return_date("3/1/2027", today) == ci.return_date("2027-03-01", today) == date(2027, 3, 1)
    assert ci.return_date("Undisclosed", today) is None and ci.return_date(None, today) is None


def test_long_designations_survive_rotowire_rotating_to_other_schools():
    """2026-11-14: RotoWire's table moved on from Pittsburgh and Mason
    Heintschel (out for the season) vanished from the report."""
    from datetime import date
    previous = {
        "pittsburgh": [
            {"player": "Mason Heintschel", "position": "QB", "status": "Out For Season", "return": "Mar 1st",
             "source": "RotoWire + Covers", "value": 2.55, "value_recent": 0.0, "missed": 4},
            {"player": "Sean FitzSimmons", "position": "DT", "status": "Out", "return": "Nov 21st", "source": "RotoWire"},
            {"player": "Holden Geriner", "position": "QB", "status": "Doubtful", "return": "Nov 13th", "source": "RotoWire"},
            {"player": "Old Ankle", "position": "WR", "status": "Out", "return": "Nov 1st", "source": "RotoWire"},
            {"player": "Covers Only", "position": "RB", "status": "Out For Season", "source": "Covers"},
            {"player": "Open Ended", "position": "LB", "status": "Out", "source": "RotoWire"},
        ],
        "ncstate": [{"player": "Popo Aguirre", "status": "Out", "return": "Dec 1st", "source": "RotoWire"}],
    }
    merged = {"pittsburgh": [{"player": "S. FitzSimmons", "position": "DT", "status": "Out", "source": "Covers"}],
              "ncstate": []}
    carried = ci.carry_forward(merged, previous, covered={"ncstate"}, today=date(2026, 11, 14))
    assert carried == 1
    pitt = merged["pittsburgh"]
    assert [e["player"] for e in pitt] == ["S. FitzSimmons", "Mason Heintschel"]   # not listed twice
    assert "value" not in pitt[1] and "missed" not in pitt[1]   # re-valued on this run's box scores
    assert merged["ncstate"] == []   # RotoWire covers NC State now: a player it dropped is back


def test_a_stale_covers_qb_is_checked_before_it_expires(monkeypatch):
    stale = COVERS.replace("G. Reimer</span></td><td>TE", "G. Reimer</span></td><td>QB").replace(
        "(Mon, Sep 28)", "(Sat, Oct 17)")
    monkeypatch.setattr(ci, "_fetch", lambda url: stale if "covers" in url else "[]")
    monkeypatch.setattr(ci, "rotowire_card", lambda player, school, position: {
        "status": "Out For Season", "injury": "Knee", "return": "2027-03-01"})
    merged = ci.load()
    assert [(e["player"], e["status"]) for e in merged["westernkentucky"]] == [("G. Reimer", "Out For Season")]
