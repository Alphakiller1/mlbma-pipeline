#!/usr/bin/env python3
"""Refresh Today_Games, Today_Lineups, and Today_Matchups for the current ET slate day.

Run this every morning before opening the dashboard (or use full pipeline step 5).

  C:\\Users\\chase\\crawl_env\\Scripts\\python.exe -m scripts.refresh_today_slate
"""
from scrapers.scrape_lineups import run

if __name__ == "__main__":
    run()
