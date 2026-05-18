import subprocess
import sys
from datetime import datetime

PYTHON = r"C:\Users\chase\crawl_env\Scripts\python.exe"

def run_script(name):
    print(f"\n{'='*50}")
    print(f"Running {name}...")
    print(f"{'='*50}")
    result = subprocess.run([PYTHON, name], cwd=r"C:\Users\chase\mlbma_pipeline")
    if result.returncode != 0:
        print(f"ERROR: {name} failed")
        return False
    return True

print(f"MLBMA Pipeline starting at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if not run_script("scrape_savant.py"):
    sys.exit(1)

if not run_script("scrape_fangraphs.py"):
    sys.exit(1)

if not run_script("compute.py"):
    sys.exit(1)

if not run_script("push_sheets.py"):
    sys.exit(1)

print(f"\nPipeline complete at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("All metrics pushed to Google Sheets")