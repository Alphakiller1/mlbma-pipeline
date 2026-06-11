# Chase Analytics — Discord & Bot Update Plan

How Discord is wired today, what auto-posts, and the channel/role plan for launch.

---

## Current integration status
| Piece | Status | Notes |
|---|---|---|
| Discord server | ✅ | Owned by **chase@battlebetz**. Public invite `discord.gg/Fb3fHrqK`. |
| Patreon → Discord | ✅ | Patreon's native integration auto-assigns the paid role by tier. |
| Daily auto-post | ✅ (manual today) | `outputs/push_discord.py` posts the signals embed via webhook. |
| OAuth "Connect Discord" | ✅ | `functions/api/discord/connect|callback.js` links Discord → Supabase profile. Optional now. |
| Role-sync bot fn | 💤 | `functions/api/discord/sync-role.js` exists but is dormant (Patreon handles roles). |
| Dev app owner | ℹ️ | The OAuth/bot app lives under **chase4sichi** (manage it logged in as that account). |

## Patreon-to-Discord flow (authoritative for roles)
1. Member pledges the **Premium** tier on Patreon.
2. Member links their Discord on Patreon (once).
3. Patreon auto-grants the **Premium** Discord role; auto-removes on cancel/lapse.
4. **Requirement:** the Patreon bot's role must sit **above** the Premium role in the hierarchy.

> We are NOT using the custom `sync-role` function for roles while Patreon owns that flow.
> Keep it dormant; revisit only if you move billing to Stripe.

## What the bot/webhook should post automatically
- **Daily signals** (already built) — convergence plays, largest lineup edges, hot L14 teams,
  linked to chase-analytics.com. Posted each morning after the pipeline.
- **(Later)** matchup-of-the-day spotlight, bullpen warnings, big model moves.

## Recommended channels
| Channel | Purpose | Who posts |
|---|---|---|
| `#announcements` | launches, schedule, big news | you (manual) |
| `#daily-dash` | the daily signals embed | bot/webhook (automated) |
| `#matchup-alerts` | matchup-of-the-day / time-sensitive edges | bot (later) |
| `#model-updates` | methodology notes, metric changes | you / bot |
| `#member-support` | premium help, questions | you |
| (premium-only) `#premium-signals` | deeper boards for paid role | bot (gated by role) |

Point the webhook (`DISCORD_WEBHOOK_URL` in `.env`) at **`#daily-dash`**. For a separate
premium feed later, create a second webhook for `#premium-signals`.

## Daily update message format (current)
A branded embed (purple `#9A6BFF`), title linking to the site, three fields (🎯 convergence,
⚔️ edges, 🔥 hot teams), footer "Model-generated research. Not betting advice." Posted as
"Chase Analytics". See `outputs/push_discord.py` → `build_daily_embed()`.

## Role / access strategy
- **Free** members: public channels + dashboard (open).
- **Premium** (Patreon): the Premium role → premium channels. Roles flow only from Patreon.
- Admin/mod: your two accounts.

## How the dashboard links users to Discord/Patreon
- Site CTAs come from `dashboard/chase_links.js`: **Join our Discord** (invite) and **Join
  Premium on Patreon** appear in the account panel (signed-in and signed-out).
- Signed-in users also get **Connect Discord** (optional account link).

## Automate now vs later
- **Now:** wire `push_discord.post_daily_signals(send=True)` into `pipeline/main.py` so the
  daily embed posts automatically after the morning run. Reset the exposed webhook first.
- **Later:** matchup-of-the-day + bullpen-warning posts; a premium-only channel feed; reviving
  `sync-role` only if billing moves off Patreon.

## Low-risk cleanup notes
- The `sync-role` function and `DISCORD_BOT_TOKEN` are currently unused by the live flow —
  leave them in place (no harm), documented as dormant. Do not delete pre-launch.
