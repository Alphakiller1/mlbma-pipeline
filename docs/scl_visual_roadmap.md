# Sports Cappers Leaderboard Visual Modernization Roadmap

## 1. Big Picture Strategy

```mermaid
flowchart TD
    A["Current SCL Strength<br/>Credible capper rankings<br/>Tracked W-L, units, ROI<br/>Existing capper/package revenue"] --> B["Phase 1<br/>Low-Cost Modernization"]
    B --> C["Phase 2<br/>Growth Foundation"]
    C --> D["Phase 3<br/>Monetization Expansion"]
    D --> E["Phase 4<br/>Advanced Competitive Platform"]

    B --> B1["Cleaner UI<br/>Mobile-friendly leaderboard<br/>Stronger capper profiles<br/>Trust language<br/>Admin-controlled package links"]
    C --> C1["User accounts<br/>Followed cappers<br/>Watchlists<br/>Email capture<br/>Better package marketplace"]
    D --> D1["Hybrid revenue<br/>Affiliate links stay active<br/>SCL Direct subscriptions<br/>Stripe payments<br/>Premium plays<br/>Revenue reporting"]
    E --> E1["Personalized recommendations<br/>CLV/line movement<br/>Advanced analytics<br/>PWA/mobile app<br/>Automated reporting"]
```

## 2. Platform Component Map

```mermaid
flowchart LR
    U["Bettors / Users"] --> FE["Modern SCL Website"]
    CAPPERS["Cappers"] --> FE
    ADMINS["SCL Owners / Admins"] --> ADMIN["Admin Dashboard"]

    FE --> LB["Leaderboard Engine"]
    FE --> CP["Capper Profiles"]
    FE --> PM["Package Marketplace"]
    FE --> AUTH["User Accounts"]
    FE --> EMAIL["Email / Retention"]

    LB --> DATA["Capper Performance Data<br/>Records, units, ROI, streaks, sports"]
    CP --> DATA
    PM --> AFF["Affiliate / Winible Links"]
    PM --> DIRECT["Future SCL Direct Checkout"]

    ADMIN --> DATA
    ADMIN --> AFF
    ADMIN --> APPROVAL["Package Approval Workflow"]
    ADMIN --> FEATURED["Featured Capper Placement"]

    DIRECT --> STRIPE["Stripe / Subscription Tools"]
    EMAIL --> USERS["Followed capper alerts<br/>Weekly leaderboard digests<br/>Hot streak notifications"]
```

## 3. Cost-Control Build Order

```mermaid
flowchart TD
    A["Build First<br/>High value, lower cost"] --> A1["Design refresh"]
    A --> A2["Responsive leaderboard"]
    A --> A3["Improved capper profiles"]
    A --> A4["Admin-managed package links"]
    A --> A5["Trust badges and ranking explanation"]

    B["Build Next<br/>Growth and retention"] --> B1["User accounts"]
    B --> B2["Follow/save cappers"]
    B --> B3["Email signup and weekly digest"]
    B --> B4["Better package marketplace"]
    B --> B5["Basic admin dashboard"]

    C["Build Later<br/>Only after validation"] --> C1["Direct SCL payments"]
    C --> C2["Premium plays"]
    C --> C3["Capper self-service dashboard"]
    C --> C4["Revenue reporting"]

    D["Delay<br/>Expensive or complex"] --> D1["Native mobile app"]
    D --> D2["Sportsbook sync"]
    D --> D3["AI picks"]
    D --> D4["Community forums"]
    D --> D5["Full CLV/line movement automation"]
```

## 4. Scalability Ladder

```mermaid
flowchart TD
    L1["Level 1: Modern Website<br/>Static or simple dynamic frontend<br/>Existing data cleaned up<br/>Affiliate links retained"] --> L2["Level 2: Interactive Product<br/>Filters, sorting, charts<br/>Capper profile pages<br/>Email capture"]
    L2 --> L3["Level 3: User Platform<br/>Accounts<br/>Followed cappers<br/>Watchlists<br/>Personalized dashboards"]
    L3 --> L4["Level 4: Marketplace<br/>Package marketplace<br/>Admin approval<br/>Affiliate tracking<br/>Featured placements"]
    L4 --> L5["Level 5: Hybrid Commerce<br/>Affiliate + SCL Direct<br/>Stripe subscriptions<br/>Premium access<br/>Revenue reporting"]
    L5 --> L6["Level 6: Competitive Analytics Platform<br/>CLV<br/>Line movement<br/>Recommendations<br/>Automated reports<br/>PWA/app experience"]
```

## 5. Revenue Model Evolution

```mermaid
flowchart LR
    R1["Current Revenue<br/>Capper marketing<br/>Affiliate/package links"] --> R2["Optimized Affiliate Model<br/>Admin-controlled links<br/>UTM tracking<br/>Featured packages"]
    R2 --> R3["Marketplace Revenue<br/>Featured capper placement<br/>Premium listing tiers<br/>Sponsored profiles with disclosure"]
    R3 --> R4["Direct Revenue<br/>SCL Direct subscriptions<br/>Premium plays<br/>Stripe checkout<br/>Capper commission model"]
    R4 --> R5["Data Revenue<br/>Capper reports<br/>Advanced bettor analytics<br/>Partnership/reporting opportunities"]
```

## 6. Recommended Product Architecture

```mermaid
flowchart TB
    subgraph Public["Public Website"]
        Home["Homepage"]
        Leaderboard["Leaderboard"]
        Profiles["Capper Profiles"]
        Packages["Package Marketplace"]
        SEO["SEO Content / Education"]
    end

    subgraph User["User Layer"]
        Accounts["Accounts"]
        Follows["Followed Cappers"]
        Watchlist["Saved Packages / Watchlist"]
        Alerts["Email Alerts"]
    end

    subgraph Admin["Admin Layer"]
        CapperMgmt["Capper Management"]
        PackageMgmt["Package Management"]
        LinkMgmt["Affiliate Link Management"]
        Approval["Approval Workflow"]
        Reporting["Basic Reporting"]
    end

    subgraph Data["Data Layer"]
        Picks["Picks"]
        Stats["Stats"]
        Rankings["Rankings"]
        Revenue["Revenue / Clicks"]
    end

    Public --> User
    Public --> Data
    User --> Data
    Admin --> Data
    Admin --> Public
```

## 7. What SCL Should Become

```mermaid
flowchart TD
    A["Old Position<br/>Useful capper ranking site"] --> B["Modern Position<br/>Trusted capper discovery platform"]
    B --> C["Near-Term Advantage<br/>Cleaner rankings<br/>Better mobile<br/>Better capper profiles<br/>Higher package conversion"]
    C --> D["Mid-Term Advantage<br/>User accounts<br/>Follows<br/>Email retention<br/>Marketplace organization"]
    D --> E["Long-Term Advantage<br/>Hybrid affiliate/direct commerce<br/>Advanced analytics<br/>Personalized recommendations"]
    E --> F["Competitive Goal<br/>More transparent than hype-based capper sites<br/>Lower friction than sportsbook-sync apps<br/>More profitable for SCL and listed cappers"]
```

