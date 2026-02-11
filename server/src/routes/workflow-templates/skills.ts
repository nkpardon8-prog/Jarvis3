// ─── Custom SKILL.md Content for Workflow Templates ──────
// Each key is a skill slug; value is the full SKILL.md content
// deployed to ~/.openclaw/skills/<slug>/SKILL.md at activation time

export const CUSTOM_SKILLS: Record<string, string> = {

  // ── 01. Morning Briefing ──────────────────────────────
  "morning-briefing-composer": `---
name: Morning Briefing Composer
description: Aggregates calendar, weather, news, and email data into a formatted daily briefing
version: 1.0.0
author: jarvis
tags:
  - productivity
  - daily
  - briefing
  - workflow
---

# Morning Briefing Composer

Compiles a personalized morning briefing by pulling data from multiple sources and formatting it into a concise, actionable digest.

## Authentication

- Google Calendar: Use the jarvis-google proxy skill (already installed) for calendar events
- Weather: Use the OPENWEATHERMAP_KEY environment variable from ~/.openclaw/.env
- News: Use the NEWS_API_KEY environment variable from ~/.openclaw/.env (or fall back to web search)
- Email: Use the jarvis-google proxy skill for Gmail

## Capabilities

- Fetch today's calendar events with times and attendees
- Get current weather and forecast for user's location
- Pull top news headlines filtered by user interests
- Summarize unread priority emails
- Format everything into a structured daily briefing

## API Reference

### OpenWeatherMap
- GET https://api.openweathermap.org/data/2.5/weather?q={city}&appid={OPENWEATHERMAP_KEY}&units=metric
- GET https://api.openweathermap.org/data/2.5/forecast?q={city}&appid={OPENWEATHERMAP_KEY}&units=metric&cnt=8

### NewsAPI
- GET https://newsapi.org/v2/top-headlines?country=us&apiKey={NEWS_API_KEY}
- GET https://newsapi.org/v2/everything?q={topics}&apiKey={NEWS_API_KEY}&sortBy=publishedAt&pageSize=5

## Instructions

1. Read environment variables from ~/.openclaw/.env for API keys
2. Fetch calendar events for today using the Google proxy
3. Fetch weather data using OpenWeatherMap API
4. Fetch news headlines using NewsAPI or web search
5. Fetch unread emails from Gmail proxy, identify priority ones
6. Compose a structured briefing with sections: Schedule, Weather, News, Priority Emails
7. Deliver via the user's preferred channel
`,

  // ── 02. Email Triage ──────────────────────────────────
  "email-classifier": `---
name: Email Classifier
description: LLM-based email classification and auto-labeling system
version: 1.0.0
author: jarvis
tags:
  - email
  - classification
  - gmail
  - workflow
---

# Email Classifier

Reads incoming emails and classifies them into user-defined categories using LLM reasoning. Applies Gmail labels and optionally auto-archives low-priority mail.

## Authentication

- Gmail: Use the jarvis-google proxy skill for reading and labeling emails
- No additional API keys required — classification uses the LLM's built-in reasoning

## Capabilities

- Read unread emails (subject, sender, body snippet)
- Classify into categories: urgent, action-required, newsletter, receipt, personal, promotional
- Apply Gmail labels based on classification
- Auto-archive emails below a configurable priority threshold
- Track classification history for improved accuracy

## Classification Rules

- **Urgent**: From direct reports, executives, clients; contains "ASAP", "urgent", "deadline", "critical"
- **Action Required**: Needs a response but not time-critical; questions, requests, invitations
- **Newsletter**: Bulk mail, mailing lists, regular digests
- **Receipt**: Purchase confirmations, invoices, shipping notifications
- **Personal**: From known personal contacts, family
- **Promotional**: Marketing, sales, offers, coupons

## Instructions

1. Fetch unread emails since last run using Gmail proxy
2. For each email, analyze sender, subject, and body snippet
3. Classify into one of the defined categories
4. Create Gmail labels if they don't exist (prefix with "Auto/")
5. Apply the appropriate label to each email
6. Auto-archive newsletters and promotional emails if user enabled this
7. Report summary: count per category, any urgent items highlighted
`,

  // ── 03. Bill Tracker ──────────────────────────────────
  "receipt-extractor": `---
name: Receipt Extractor
description: Parses email receipts and invoices to extract structured payment data
version: 1.0.0
author: jarvis
tags:
  - finance
  - receipts
  - extraction
  - workflow
---

# Receipt Extractor

Scans email for receipts, invoices, and subscription confirmations. Extracts vendor name, amount, date, and category into structured JSON.

## Authentication

- Gmail: Use the jarvis-google proxy skill for email access

## Capabilities

- Search Gmail for receipt/invoice emails using query patterns
- Extract: vendor name, amount, currency, date, payment method, category
- Detect subscription patterns (recurring charges from same vendor)
- Output structured JSON for downstream processing

## Email Search Patterns

- Subject contains: "receipt", "invoice", "order confirmation", "payment", "subscription"
- From known receipt senders: noreply@, billing@, receipts@
- Has "amount" or "$" or currency symbols in body

## Instructions

1. Search Gmail for receipt-like emails since last run
2. For each match, read the full email body
3. Extract structured data: vendor, amount, date, category
4. Identify if this is a one-time purchase or recurring subscription
5. Output JSON array of extracted receipts
6. Flag any unusually large amounts for user attention
`,

  "expense-tracker": `---
name: Expense Tracker
description: Maintains a running expense log with subscription tracking and bill alerts
version: 1.0.0
author: jarvis
tags:
  - finance
  - expenses
  - tracking
  - workflow
---

# Expense Tracker

Maintains a persistent expense log from extracted receipts. Tracks subscriptions by recurrence, calculates monthly totals, and alerts before bills are due.

## Authentication

- Google Drive: Use the jarvis-google proxy skill for spreadsheet storage (optional)
- Local storage: Can use ~/.openclaw/data/expenses.json as fallback

## Capabilities

- Append new expenses from receipt-extractor output
- Deduplicate entries by vendor + date + amount
- Track subscriptions: identify recurring charges, predict next billing date
- Calculate monthly/weekly spending totals by category
- Send alerts N days before predicted bill due dates
- Export to CSV or Google Sheets

## Data Format

Each expense entry:
- id: unique identifier
- vendor: company name
- amount: number
- currency: string (default USD)
- date: ISO date string
- category: string (food, transport, subscription, utilities, etc.)
- isRecurring: boolean
- recurrenceInterval: "monthly" | "yearly" | "weekly" | null
- nextDueDate: ISO date string | null

## Instructions

1. Read existing expense data from storage
2. Merge new receipts from receipt-extractor, deduplicating
3. Analyze patterns to identify recurring subscriptions
4. Calculate category totals for current month
5. Check for upcoming bills (within next 7 days)
6. Generate summary report with totals, trends, and alerts
`,

  // ── 04. Calendar Assistant ────────────────────────────
  "schedule-optimizer": `---
name: Schedule Optimizer
description: Analyzes calendar patterns and suggests optimal meeting slots
version: 1.0.0
author: jarvis
tags:
  - calendar
  - scheduling
  - productivity
  - workflow
---

# Schedule Optimizer

Analyzes your calendar for conflicts, suggests optimal time slots based on preferences, and helps manage scheduling requests.

## Authentication

- Google Calendar: Use the jarvis-google proxy skill
- Gmail: Use the jarvis-google proxy skill for scheduling emails

## Capabilities

- Detect overlapping calendar events (conflicts)
- Analyze free/busy patterns across the week
- Suggest meeting slots based on user preferences (focus blocks, lunch, quiet hours)
- Generate availability summaries for sharing
- Auto-respond to scheduling requests with suggested times

## User Preferences (configurable)

- No meetings before: configurable (default 9:00 AM)
- Lunch block: configurable (default 12:00-1:00 PM)
- Focus time blocks: configurable (default 2-hour morning block)
- Buffer between meetings: configurable (default 15 min)
- Preferred meeting days: configurable

## Instructions

1. Fetch all calendar events for the relevant date range
2. Identify any conflicts (overlapping events)
3. Map free time slots considering user preferences
4. For scheduling requests: suggest top 3 available slots
5. For daily review: list today's events with conflict warnings
6. Generate prep notes for upcoming meetings (attendees, agenda if available)
`,

  // ── 05. Meal Planner ──────────────────────────────────
  "meal-planner": `---
name: Meal Planner
description: AI-powered meal planning with grocery list generation
version: 1.0.0
author: jarvis
tags:
  - food
  - meal-planning
  - grocery
  - workflow
---

# Meal Planner

Generates weekly meal plans based on dietary preferences, household size, and budget. Produces consolidated grocery lists.

## Authentication

- Notion (optional): Use NOTION_API_KEY from ~/.openclaw/.env for saving plans
- No required API keys — uses LLM knowledge for recipes and nutrition

## Capabilities

- Generate 7-day meal plans (breakfast, lunch, dinner, snacks)
- Respect dietary preferences (vegetarian, keto, gluten-free, allergies)
- Account for household size and budget
- Consolidate ingredients into a deduplicated grocery list
- Suggest recipes based on ingredients already on hand
- Save plans to Notion or local storage

## Instructions

1. Read user preferences: diet type, household size, budget, allergies
2. Generate a 7-day meal plan with variety and balanced nutrition
3. For each meal, include: name, brief description, prep time, key ingredients
4. Consolidate all ingredients into a single grocery list
5. Group grocery items by store section (produce, dairy, meat, pantry)
6. Estimate total grocery cost
7. Save plan and list to configured storage
`,

  // ── 06. Package Tracker ───────────────────────────────
  "package-tracker": `---
name: Package Tracker
description: Extracts tracking numbers from emails and monitors delivery status
version: 1.0.0
author: jarvis
tags:
  - shipping
  - tracking
  - delivery
  - workflow
---

# Package Tracker

Automatically detects shipping confirmation emails, extracts tracking numbers, and monitors delivery status across carriers.

## Authentication

- Gmail: Use the jarvis-google proxy skill
- AfterShip (optional): Use AFTERSHIP_API_KEY from ~/.openclaw/.env

## Tracking Number Patterns

- USPS: 20-22 digit numbers starting with 9
- UPS: 1Z followed by 16 alphanumeric characters
- FedEx: 12-15 digit numbers
- Amazon: TBA followed by 12 digits
- DHL: 10-digit numbers

## Capabilities

- Search Gmail for shipping confirmation emails
- Extract tracking numbers using regex patterns
- Query carrier APIs or AfterShip for delivery status
- Maintain active tracking list with last-known status
- Send alerts on status changes (out for delivery, delivered)
- Generate daily summary of incoming packages

## Instructions

1. Search Gmail for shipping/tracking emails since last run
2. Extract tracking numbers and carrier identification
3. For each active tracking: query status via AfterShip API or web search
4. Compare with last known status — detect changes
5. Send immediate alert for deliveries and out-for-delivery updates
6. Compile daily summary: expected deliveries, in-transit packages, delivered today
`,

  // ── 07. Social Media ──────────────────────────────────
  "content-repurposer": `---
name: Content Repurposer
description: Reformats content for multiple social media platforms
version: 1.0.0
author: jarvis
tags:
  - social-media
  - content
  - marketing
  - workflow
---

# Content Repurposer

Takes a single piece of content and reformats it for multiple social media platforms with appropriate length, tone, hashtags, and formatting.

## Capabilities

- Reformat long-form content into platform-specific posts
- Generate appropriate hashtags per platform
- Adjust tone and length for each platform's audience
- Create thread versions for Twitter/X
- Add emoji and formatting per platform conventions
- Suggest optimal posting times

## Platform Specifications

- **Twitter/X**: Max 280 chars per tweet, support thread format, 3-5 hashtags
- **LinkedIn**: Professional tone, 1300 char sweet spot, 3 hashtags, paragraph breaks
- **Instagram**: Casual/visual tone, max 2200 chars, 20-30 hashtags (in first comment), emoji-rich
- **Facebook**: Conversational tone, 40-80 words optimal, 1-2 hashtags

## Instructions

1. Read the source content (blog post, article, notes, or raw text)
2. Identify the key message and call-to-action
3. For each target platform, generate an optimized version
4. Include relevant hashtags appropriate to each platform
5. Suggest accompanying media (image descriptions, video ideas)
6. Output all versions in a structured format for scheduling
`,

  "social-scheduler": `---
name: Social Scheduler
description: Manages a posting queue with platform-specific API integrations
version: 1.0.0
author: jarvis
tags:
  - social-media
  - scheduling
  - publishing
  - workflow
---

# Social Scheduler

Manages a posting queue for social media content, handles platform API integrations, and publishes at optimal times.

## Authentication

- Twitter/X: Use TWITTER_API_KEY and TWITTER_API_SECRET from ~/.openclaw/.env
- LinkedIn: Use LINKEDIN_API_KEY from ~/.openclaw/.env
- Other platforms: Configure via additional env vars

## Capabilities

- Maintain a posting queue with scheduled publish times
- Publish to Twitter/X, LinkedIn, Instagram (via API or notification)
- Track post performance (likes, shares, comments) where API supports it
- Suggest optimal posting times based on engagement data
- Cross-post management with platform-specific variations

## API Reference

### Twitter/X API v2
- POST https://api.twitter.com/2/tweets — Create tweet
- Headers: Authorization: Bearer {TWITTER_API_KEY}

### LinkedIn API
- POST https://api.linkedin.com/v2/ugcPosts — Create post
- Headers: Authorization: Bearer {LINKEDIN_API_KEY}

## Instructions

1. Read the posting queue from storage
2. Check for posts due for publishing
3. For each due post: call the appropriate platform API
4. Log success/failure for each publish attempt
5. Check engagement metrics for recently published posts
6. Report: posts published, posts queued, engagement summary
`,

  // ── 08. File Organizer ────────────────────────────────
  "smart-file-organizer": `---
name: Smart File Organizer
description: Scans directories and automatically sorts files by type, project, or date
version: 1.0.0
author: jarvis
tags:
  - files
  - organization
  - cleanup
  - workflow
---

# Smart File Organizer

Scans target directories and automatically sorts files into organized folder structures. Identifies duplicates and flags large files.

## Authentication

- No API keys required — uses local filesystem access (built into OpenClaw)

## Capabilities

- Scan directories recursively for files
- Classify files by extension, name patterns, and content
- Move files into organized folder structures
- Detect duplicate files via filename and size comparison
- Flag files above a configurable size threshold
- Generate cleanup reports
- Support dry-run mode (report only, no moves)

## Default Folder Structure

- Documents/ (pdf, doc, docx, txt, rtf, odt)
- Images/ (jpg, jpeg, png, gif, svg, webp, heic)
- Videos/ (mp4, mov, avi, mkv, webm)
- Audio/ (mp3, wav, flac, aac, m4a)
- Archives/ (zip, tar, gz, rar, 7z)
- Code/ (js, ts, py, go, rs, java, cpp, h)
- Spreadsheets/ (csv, xlsx, xls, numbers)
- Presentations/ (pptx, ppt, key)
- Other/ (everything else)

## Instructions

1. Read target directory path from user config (default: ~/Downloads)
2. Scan all files in the directory (non-recursive by default)
3. Classify each file by extension into the folder structure
4. Check for duplicates (same name + size in target folder)
5. If dry-run: report what would be moved. If live: move files
6. Flag files > 100MB for user attention
7. Generate report: files moved, duplicates found, space analysis
`,

  // ── 09. Smart Home ────────────────────────────────────
  "routine-builder": `---
name: Routine Builder
description: Natural language interface for creating multi-device smart home routines
version: 1.0.0
author: jarvis
tags:
  - smart-home
  - home-assistant
  - automation
  - workflow
---

# Routine Builder

Translates natural language commands into Home Assistant automations. Create and modify smart home routines through conversation.

## Authentication

- Home Assistant: Use HOME_ASSISTANT_TOKEN and HOME_ASSISTANT_URL from ~/.openclaw/.env

## Capabilities

- Query all Home Assistant devices and their current states
- Execute service calls (turn on/off lights, set thermostat, lock doors)
- Create named routines that execute multiple actions in sequence
- Trigger routines based on time, presence, or conditions
- Provide natural language status reports

## API Reference

### Home Assistant REST API
- GET {HOME_ASSISTANT_URL}/api/states — All device states
- POST {HOME_ASSISTANT_URL}/api/services/{domain}/{service} — Execute service
- Headers: Authorization: Bearer {HOME_ASSISTANT_TOKEN}

### Common Services
- light.turn_on, light.turn_off — {entity_id, brightness, color_temp}
- switch.turn_on, switch.turn_off — {entity_id}
- climate.set_temperature — {entity_id, temperature}
- lock.lock, lock.unlock — {entity_id}
- media_player.media_play, media_player.media_pause — {entity_id}

## Instructions

1. Connect to Home Assistant API and enumerate available devices
2. Parse natural language routine description into discrete actions
3. For each action, identify the target device and service call
4. Execute actions in sequence with brief delays between steps
5. Verify each action succeeded by checking state change
6. Report: actions taken, any failures, current device states
`,

  // ── 10. Travel Planner ────────────────────────────────
  "travel-planner": `---
name: Travel Planner
description: Researches destinations, compares prices, and builds structured itineraries
version: 1.0.0
author: jarvis
tags:
  - travel
  - planning
  - booking
  - workflow
---

# Travel Planner

Multi-step travel planning skill that researches destinations, builds day-by-day itineraries, and monitors price changes.

## Authentication

- SerpAPI (for flight/hotel search): Use SERPAPI_KEY from ~/.openclaw/.env
- Gmail: Use jarvis-google proxy for booking confirmation tracking
- Web search: Use built-in web browsing for research

## Capabilities

- Research destinations based on preferences and budget
- Search for flights and hotels via SerpAPI
- Build day-by-day itineraries with activities
- Track booking confirmations from email
- Monitor price drops on watched flights/hotels
- Generate packing lists and pre-trip checklists

## Instructions

1. Gather trip parameters: destination, dates, budget, preferences, party size
2. Research destination: weather, attractions, safety, local tips
3. Search flights via SerpAPI Google Flights endpoint
4. Search accommodations via web search
5. Build day-by-day itinerary with morning/afternoon/evening activities
6. Estimate total trip cost breakdown
7. Generate packing list based on destination weather and activities
8. Save trip plan to storage for monitoring and updates
`,

  // ── 11. Meeting Notes ─────────────────────────────────
  "meeting-summarizer": `---
name: Meeting Summarizer
description: Processes meeting transcripts to extract summaries, decisions, and action items
version: 1.0.0
author: jarvis
tags:
  - meetings
  - notes
  - productivity
  - workflow
---

# Meeting Summarizer

Processes meeting transcripts or recordings to generate concise summaries with key decisions and action items.

## Authentication

- Zoom API (optional): Use ZOOM_API_KEY from ~/.openclaw/.env
- Notion: Use NOTION_API_KEY from ~/.openclaw/.env for storing notes
- Slack: Use SLACK_WEBHOOK_URL from ~/.openclaw/.env for distributing notes

## Capabilities

- Process meeting transcripts (text input or Zoom API)
- Extract: summary, key decisions, action items with owners, follow-up dates
- Create structured meeting notes in Notion
- Distribute notes via Slack or email
- Route action items to project management tools

## Output Format

### Meeting Notes Template
- **Meeting**: [title]
- **Date**: [date]
- **Attendees**: [list]
- **Summary**: 3-5 sentence overview
- **Key Decisions**: Bulleted list
- **Action Items**: Table with columns: Task, Owner, Due Date, Status
- **Follow-ups**: Next meeting date, open questions

## Instructions

1. Receive meeting transcript (from Zoom API, Granola, or direct input)
2. Analyze transcript for key topics, decisions, and commitments
3. Extract action items: identify who committed to what and by when
4. Generate structured meeting notes following the template
5. Save to Notion (create new page in configured database)
6. Post summary to Slack channel
7. If email distribution is configured, send notes to attendees
`,

  // ── 12. Security Auditor ──────────────────────────────
  "security-auditor": `---
name: Security Auditor
description: Reviews password health and checks for data breach exposure
version: 1.0.0
author: jarvis
tags:
  - security
  - passwords
  - audit
  - workflow
---

# Security Auditor

Analyzes password health, checks for breach exposure, and generates prioritized security reports.

## Authentication

- HaveIBeenPwned: Use HIBP_API_KEY from ~/.openclaw/.env
- 1Password CLI (optional): Access via local 'op' command if installed

## Capabilities

- Check email addresses against HaveIBeenPwned breach database
- Analyze password manager exports for weak/reused passwords
- Generate risk scores based on breach recency and severity
- Produce prioritized action lists (which passwords to change first)
- Send monthly security digest

## API Reference

### HaveIBeenPwned API v3
- GET https://haveibeenpwned.com/api/v3/breachedaccount/{email}
- Headers: hibp-api-key: {HIBP_API_KEY}, user-agent: Jarvis-Security-Auditor

### 1Password CLI (if available)
- op item list --format json
- op item get {id} --format json

## Instructions

1. Collect user's email addresses to check
2. Query HaveIBeenPwned for each email address
3. For each breach found: note the breach name, date, compromised data types
4. If 1Password CLI available: audit password strength and reuse
5. Calculate risk score per account (recent breach + weak password = critical)
6. Generate prioritized report: Critical, High, Medium, Low risk accounts
7. Recommend specific actions for each risk level
`,

  // ── 13. Fitness Tracker ───────────────────────────────
  "habit-tracker": `---
name: Habit Tracker
description: Tracks daily habits with streaks, check-ins, and progress reports
version: 1.0.0
author: jarvis
tags:
  - fitness
  - habits
  - tracking
  - workflow
---

# Habit Tracker

Manages user-defined daily habits with check-in prompts, streak tracking, and weekly progress reports.

## Authentication

- Strava (optional): Use STRAVA_API_KEY from ~/.openclaw/.env for auto-logging fitness
- Local storage: Uses ~/.openclaw/data/habits.json for persistence

## Capabilities

- Define custom habits (meditation, reading, exercise, water intake, etc.)
- Daily check-in prompts via configured messaging channel
- Track completion streaks and rates
- Auto-log fitness activities from Strava/Apple Health if connected
- Generate weekly/monthly progress visualizations (text-based)
- Provide encouragement and streak-protection reminders

## Data Format

Each habit:
- id: unique identifier
- name: string
- frequency: "daily" | "weekdays" | "custom"
- targetPerDay: number (e.g., 8 glasses of water)
- unit: string (e.g., "glasses", "minutes", "pages")
- history: array of {date, completed, value}
- currentStreak: number
- longestStreak: number

## Instructions

1. Load habit definitions and history from storage
2. For morning check-in: list today's habits and current streaks
3. Record completions as user reports them
4. Update streak counters
5. For weekly report: calculate completion rates, highlight achievements
6. Send encouraging messages for maintained streaks
7. Alert when a streak is at risk (missed yesterday)
`,

  // ── 14. News Digest ───────────────────────────────────
  "news-curator": `---
name: News Curator
description: Aggregates news from multiple sources, deduplicates, and creates curated digests
version: 1.0.0
author: jarvis
tags:
  - news
  - research
  - digest
  - workflow
---

# News Curator

Aggregates content from RSS feeds, news APIs, and web sources. Deduplicates stories, scores relevance, and formats into digestible briefings.

## Authentication

- NewsAPI (optional): Use NEWS_API_KEY from ~/.openclaw/.env
- Web search: Use built-in web browsing for source scanning

## Capabilities

- Fetch news from NewsAPI, RSS feeds, and web search
- Deduplicate stories by topic similarity
- Score relevance against user interest profile
- Summarize articles concisely (2-3 sentences each)
- Track specific companies, stocks, or topics
- Alert on breaking developments
- Format into structured daily/weekly digest

## Instructions

1. Load user's topic interests and tracked entities
2. Fetch headlines from NewsAPI (if key available) and web search
3. For each story: extract title, source, URL, brief excerpt
4. Deduplicate: group similar stories, keep the best source
5. Score relevance against user interests (0-100)
6. Sort by relevance score, take top 10-15 stories
7. Summarize each story in 2-3 sentences
8. Format into sections: Top Stories, Tracked Topics, Trending
9. Deliver digest via configured channel
`,

  // ── 15. Photo Organizer ───────────────────────────────
  "photo-organizer": `---
name: Photo Organizer
description: Organizes photos by date, location, and content using AI tagging
version: 1.0.0
author: jarvis
tags:
  - photos
  - organization
  - media
  - workflow
---

# Photo Organizer

Scans photo directories, reads metadata, classifies content, detects duplicates, and organizes into structured folders.

## Authentication

- Google Drive/Photos (optional): Use jarvis-google proxy
- Local filesystem: Built into OpenClaw

## Capabilities

- Scan directories for image files (jpg, png, heic, etc.)
- Read EXIF data (date, location, camera info)
- Organize by date (Year/Month/Day structure)
- Detect duplicate images via file hash comparison
- Generate folder-level summaries
- Move or copy files into organized structure

## Folder Structure

- Photos/
  - 2026/
    - 01-January/
    - 02-February/
    - ...
  - Unsorted/ (no EXIF date)
  - Duplicates/ (detected duplicates, review before deleting)

## Instructions

1. Scan configured photo directory for image files
2. Read EXIF metadata from each file (date taken, GPS, camera)
3. Organize by date into Year/Month folders
4. Detect duplicates by comparing file hashes
5. Move duplicates to a review folder (never auto-delete)
6. Generate report: total files, organized count, duplicates found, storage used
`,

  // ── 16. Invoice Generator ─────────────────────────────
  "invoice-generator": `---
name: Invoice Generator
description: Creates professional invoices from natural language input
version: 1.0.0
author: jarvis
tags:
  - finance
  - invoicing
  - freelance
  - workflow
---

# Invoice Generator

Creates professional invoices from conversational input, tracks payment status, and sends automated reminders.

## Authentication

- Gmail: Use jarvis-google proxy for sending invoices
- Google Drive: Use jarvis-google proxy for PDF storage

## Capabilities

- Parse natural language into invoice line items
- Generate formatted invoice (markdown or HTML for PDF conversion)
- Assign sequential invoice numbers
- Track invoice status: draft, sent, viewed, paid, overdue
- Send payment reminders at configurable intervals
- Maintain client database

## Invoice Format

- Invoice #: sequential number (INV-2026-001)
- From: user's business details (configurable)
- To: client name and details
- Date: issue date
- Due: payment terms (Net 15, Net 30, etc.)
- Line items: description, quantity, rate, amount
- Subtotal, tax (if applicable), total
- Payment instructions

## Instructions

1. Parse user input for: client, services, hours/quantity, rate, payment terms
2. Look up client in database (or create new entry)
3. Generate next invoice number
4. Create formatted invoice document
5. Save to storage and optionally upload to Google Drive
6. Send via email to client (if requested)
7. Create payment reminder cron job based on due date
8. Log invoice in tracking system with "sent" status
`,

  "expense-reporter": `---
name: Expense Reporter
description: Compiles categorized expense reports from tracked data
version: 1.0.0
author: jarvis
tags:
  - finance
  - expenses
  - reports
  - workflow
---

# Expense Reporter

Compiles categorized expense reports from tracked receipts, invoices, and bank data. Generates tax-ready summaries.

## Authentication

- Google Drive: Use jarvis-google proxy for report storage
- Data source: Reads from expense-tracker's data store

## Capabilities

- Aggregate expenses by category, vendor, and time period
- Calculate tax-deductible amounts by category
- Generate monthly, quarterly, and annual reports
- Compare spending trends across periods
- Export to CSV or formatted markdown
- Identify unusual spending patterns

## Instructions

1. Load expense data for the requested period
2. Categorize and aggregate by: category, vendor, month
3. Calculate totals: gross spending, tax-deductible, by category
4. Compare with previous period for trends
5. Flag unusual patterns (spending spikes, new recurring charges)
6. Generate formatted report with summary tables
7. Save report to storage / Google Drive
`,

  // ── 17. Bookmark Manager ──────────────────────────────
  "smart-bookmarker": `---
name: Smart Bookmarker
description: Saves, tags, and summarizes bookmarked URLs with periodic digests
version: 1.0.0
author: jarvis
tags:
  - bookmarks
  - reading
  - organization
  - workflow
---

# Smart Bookmarker

Receives URLs, fetches content, generates summaries, auto-tags, and maintains an organized reading list.

## Authentication

- Linkding (optional): Use LINKDING_API_KEY and LINKDING_URL from ~/.openclaw/.env
- Local storage: Falls back to ~/.openclaw/data/bookmarks.json

## Capabilities

- Save URLs with auto-generated titles and summaries
- Auto-tag based on content analysis
- Maintain reading list with read/unread status
- Generate weekly unread digest
- Search bookmarks by tag, title, or content
- Extract key highlights from articles

## API Reference (Linkding)

- POST {LINKDING_URL}/api/bookmarks/ — Create bookmark
- GET {LINKDING_URL}/api/bookmarks/ — List bookmarks
- Headers: Authorization: Token {LINKDING_API_KEY}

## Instructions

1. Receive URL from user (via chat or automated feed)
2. Fetch the page content
3. Generate a 2-3 sentence summary
4. Auto-assign tags based on content topics
5. Save to Linkding (if configured) or local storage
6. For weekly digest: compile unread bookmarks by tag/category
7. Deliver digest via configured channel
`,

  // ── 18. Pet & Plant Care ──────────────────────────────
  "care-scheduler": `---
name: Care Scheduler
description: Manages recurring care tasks for pets and plants with weather-adjusted scheduling
version: 1.0.0
author: jarvis
tags:
  - pets
  - plants
  - reminders
  - workflow
---

# Care Scheduler

Manages care schedules for pets and plants with species-specific defaults, weather-adjusted watering, and health record tracking.

## Authentication

- OpenWeatherMap: Use OPENWEATHERMAP_KEY from ~/.openclaw/.env for weather-based adjustments
- Google Calendar (optional): Use jarvis-google proxy for reminder integration
- Local storage: ~/.openclaw/data/care-schedule.json

## Capabilities

- Define care subjects (pets or plants) with species-specific schedules
- Track recurring tasks: feeding, watering, medication, grooming, vet visits
- Adjust plant watering frequency based on weather/season
- Log care history for health records
- Send timely reminders via configured channel
- Track vet appointments and vaccination schedules

## Data Format

Each care subject:
- id: unique identifier
- name: string (e.g., "Max", "Fiddle Leaf Fig")
- type: "pet" | "plant"
- species: string
- tasks: array of {name, frequency, lastDone, nextDue}
- healthLog: array of {date, note, type}

## Instructions

1. Load care schedule from storage
2. Check weather data for plant watering adjustments
3. Identify tasks due today and overdue tasks
4. Send reminders for due tasks
5. Log completed tasks as user reports them
6. For plants: adjust watering if recent rainfall or extreme heat
7. Weekly report: tasks completed, upcoming vet appointments, plant health
`,

  // ── 19. Price Monitor ─────────────────────────────────
  "price-monitor": `---
name: Price Monitor
description: Tracks product prices and alerts on drops below target thresholds
version: 1.0.0
author: jarvis
tags:
  - shopping
  - prices
  - alerts
  - workflow
---

# Price Monitor

Tracks product URLs with target prices. Monitors price changes and sends alerts when prices drop below thresholds.

## Authentication

- Web browsing: Uses built-in Playwright/web capabilities
- Local storage: ~/.openclaw/data/price-watchlist.json

## Capabilities

- Add products by URL (Amazon, Best Buy, etc.)
- Set target price thresholds per product
- Periodic price checks via web scraping
- Maintain price history with trend data
- Alert immediately when price drops below target
- Compare prices across retailers (via web search)
- Track Amazon wishlist items

## Data Format

Each watched product:
- id: unique identifier
- url: string (product page URL)
- name: string (product name)
- targetPrice: number
- currentPrice: number
- priceHistory: array of {date, price}
- lastChecked: ISO date
- alertSent: boolean

## Instructions

1. Load watchlist from storage
2. For each product: navigate to URL and extract current price
3. Compare with last known price — detect changes
4. Update price history
5. If current price <= target price and no alert sent: send alert immediately
6. Calculate price trends (rising/falling/stable)
7. Daily summary: price changes, products near target, best current deals
`,

  // ── 20. Weekly Review ─────────────────────────────────
  "weekly-reviewer": `---
name: Weekly Reviewer
description: Compiles comprehensive weekly reviews from all connected services
version: 1.0.0
author: jarvis
tags:
  - productivity
  - review
  - planning
  - workflow
---

# Weekly Reviewer

Aggregates data across all connected services to generate comprehensive weekly reviews with accomplishments, metrics, and planning prompts.

## Authentication

- Google Calendar: Use jarvis-google proxy
- Gmail: Use jarvis-google proxy
- Notion: Use NOTION_API_KEY from ~/.openclaw/.env
- Other services: Access through their respective installed skills

## Capabilities

- Pull calendar data: meetings attended, focus time logged
- Analyze email: messages sent/received, key threads
- Check task completion rates from connected tools
- Aggregate fitness/habit data if available
- Compile financial summary if expense tracker active
- Generate structured weekly review document
- Create next-week planning template

## Review Template

- **Week of**: [date range]
- **Accomplishments**: What got done (from calendar + tasks)
- **Meetings**: Count, total hours, key outcomes
- **Communication**: Emails sent/received, response time
- **Metrics**: Custom metrics from connected services
- **Reflections**: Prompts for user input
- **Next Week**: Upcoming calendar, planned priorities
- **Goals Check**: Progress on monthly/quarterly goals

## Instructions

1. Determine the week date range (Monday to Sunday)
2. Pull calendar events for the week — count meetings, calculate meeting hours
3. Analyze Gmail activity — emails sent, received, key threads
4. Check Notion/task tools for completed tasks
5. Pull fitness/habit data if available
6. Pull expense summary if available
7. Compile all data into the review template
8. Save to Notion (create new page) or local storage
9. Send summary via configured channel with reflection prompts
`,
};
