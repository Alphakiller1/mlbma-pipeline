"""The live NBA injury endpoint passes ESPN's lists in the published shape."""
from pathlib import Path
import json
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


def item(name, pid, status, team, **details):
    return {"athlete": {"displayName": name, "team": {"abbreviation": team},
                        "links": [{"href": f"https://www.espn.com/nba/player/_/id/{pid}/x"}]},
            "status": status, "shortComment": f"{name} update", "date": "2026-11-12T18:05Z",
            "longComment": "long", "details": {"returnDate": "2026-11-15", **details}}


class LiveInjuriesTests(unittest.TestCase):
    def run_handler(self, payload, *queries):
        source = (ROOT / "functions/api/injuries.js").read_text(encoding="utf-8")
        source = source.replace("import { json } from '../_shared/http.js';",
                                "const json=(body,status=200)=>({body,status});")
        harness = source + "\nglobalThis.fetch=async()=>({ok:true,json:async()=>(" + json.dumps(payload) + \
            ")});\nconst out=[];\nfor (const q of " + json.dumps(list(queries)) + \
            ") out.push(await onRequestGet({request:new Request('https://chase.test/api/injuries?'+q)}));\n" + \
            "console.log(JSON.stringify(out));\n"
        proc = subprocess.run(["node", "--input-type=module", "-e", harness], text=True, capture_output=True, check=True)
        return json.loads(proc.stdout)

    def test_shape_matches_the_published_slate(self):
        blocks = [{"injuries": [item("Kawhi Leonard", 6450, "Out", "TOR", side="Left", type="Knee", detail="Inflammation"),
                                item("Healthy Guy", 1, "Active", "TOR")]}]
        blocks += [{"injuries": [item(f"P{i}", 100 + i, "Day-To-Day", f"T{i}", side="Not Specified", type="Back")]}
                   for i in range(15)]
        ok, bad = self.run_handler({"injuries": blocks}, "sport=nba", "sport=nfl")
        self.assertEqual(ok["status"], 200)
        tor = ok["body"]["teams"]["TOR"]
        self.assertEqual(tor, [{"player_id": "6450", "player_name": "Kawhi Leonard", "status": "Out",
                                "detail": "Left Knee Inflammation", "comment": "Kawhi Leonard update",
                                "date": "2026-11-12T18:05Z", "return_date": "2026-11-15"}])
        self.assertEqual(ok["body"]["teams"]["T0"][0]["detail"], "Back", "an unspecified side is left out")
        self.assertNotIn("longComment", json.dumps(ok["body"]))
        self.assertEqual(bad["status"], 400)

    def test_a_short_feed_is_an_outage_not_a_healthy_league(self):
        out, = self.run_handler({"injuries": [{"injuries": [item("A", 1, "Out", "TOR")]}]}, "sport=nba")
        self.assertEqual(out["body"], {"status": "unavailable"})


if __name__ == "__main__":
    unittest.main()
