# Existing App — Jobs & Policy Aggregator, Admin Panel & Authentication

I already have an existing mobile application that I am currently developing.

I want you to extend the existing project into a complete **Jobs & Policy Aggregator platform** with:

1. Jobs aggregation
2. Policy/article aggregation
3. Dynamic website/source management
4. A dedicated Admin Panel
5. User registration and login
6. User authentication and authorization
7. Admin authentication and role-based access
8. Search, filtering and pagination
9. Background scraping/API/RSS collection
10. A modern Admin UI using **shadcn/ui**
11. A modern mobile UI using **GlueStack UI**

The most important requirement is:

> **Do not rewrite my existing application from scratch. First inspect and understand the existing project, then integrate these features into it.**

---

# 1. FIRST — INSPECT THE EXISTING PROJECT

Before modifying or creating anything, inspect the entire existing project.

Identify:

* Mobile framework
* Programming language
* Backend technology
* Database
* Existing API architecture
* Existing navigation
* Existing screens
* Existing components
* Existing state management
* Existing authentication
* Existing styling/UI system
* Existing environment configuration
* Existing folder structure
* Existing deployment configuration

Then give me a concise report containing:

### Current Architecture

```text
Mobile:
Backend:
Database:
Authentication:
State Management:
UI:
API:
Deployment:
```

Also identify:

* Which files/modules should be modified
* Which files/modules should be created
* Which existing components can be reused
* Which existing features must remain untouched

**Do not start by rewriting the application.**

---

# 2. TARGET ARCHITECTURE

Build the system around this architecture:

```text
                    ┌─────────────────────┐
                    │    Admin Panel      │
                    │    shadcn/ui        │
                    └──────────┬──────────┘
                               │
                               ▼
                       ┌───────────────┐
                       │   Backend API │
                       └───────┬───────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
    Authentication        Database            Content Engine
                              │                    │
                              │          ┌─────────┼─────────┐
                              │          │         │         │
                              │          ▼         ▼         ▼
                              │         RSS       API     Scraper
                              │          │         │         │
                              │          └─────────┼─────────┘
                              │                    │
                              └────────────────────┘
                                       │
                                       ▼
                                Backend API
                                       │
                                       ▼
                              Mobile Application
                              GlueStack UI
```

---

# 3. ADMIN PANEL

Create a dedicated Admin Panel for managing the entire platform.

The Admin Panel should be a separate web application or web section depending on the existing architecture.

Use:

## shadcn/ui

for the Admin Panel UI.

The Admin Panel should have a professional dashboard design with:

* Sidebar navigation
* Top navigation
* Dashboard cards
* Data tables
* Forms
* Dialogs
* Dropdowns
* Tabs
* Filters
* Pagination
* Toast notifications
* Loading states
* Error states
* Responsive design

Use **shadcn/ui** components wherever appropriate instead of creating unnecessary custom components.

---

# 4. ADMIN AUTHENTICATION

The Admin Panel must be protected.

Only authenticated administrators should be able to access it.

Implement:

```text
Admin Login
     ↓
Authentication
     ↓
Role Verification
     ↓
Admin Dashboard
```

Support role-based access control.

At minimum:

```text
ADMIN
USER
```

Optionally support:

```text
SUPER_ADMIN
EDITOR
```

if useful for the architecture.

Users with `USER` role must NOT be able to access the Admin Panel.

Protect admin API endpoints on the backend as well.

Do not rely only on frontend route protection.

---

# 5. ADMIN DASHBOARD

Create a dashboard showing useful statistics.

Example:

```text
Dashboard

┌──────────────┐ ┌──────────────┐
│ Total Jobs   │ │ Total Policy │
│    12,450    │ │     3,280    │
└──────────────┘ └──────────────┘

┌──────────────┐ ┌──────────────┐
│ Active Sites │ │ Active Users │
│      24      │ │    5,320     │
└──────────────┘ └──────────────┘

Latest Activity
────────────────────────────
New Jobs
New Policies
Failed Sources
New Users
```

Also show:

* Number of active sources
* Number of failed sources
* Number of jobs collected today
* Number of policies collected today
* Number of registered users
* Last successful scraping time
* Last failed scraping attempt

---

# 6. DYNAMIC WEBSITE / SOURCE MANAGEMENT

This is one of the most important features.

I want to be able to add a new website from the Admin Panel **without modifying the source code**.

For example:

```text
Admin Panel
   ↓
Sources
   ↓
Add New Source
```

Form:

```text
Source Name
Website URL
Content Type
Source Method
RSS URL
API URL
Scraping URL
Active / Inactive
Scraping Frequency
```

Content Type:

```text
JOB
POLICY
BOTH
```

Source Method:

```text
AUTO
RSS
API
SCRAPER
```

---

# 7. ADDING A NEW SCRAPING WEBSITE

When an admin adds a new source:

```text
Admin
  ↓
Add Website
  ↓
Enter URL
  ↓
Select content type
  ↓
Configure extraction
  ↓
Test Source
  ↓
Save
  ↓
Enable
```

The admin should be able to test the source before activating it.

Example:

```text
[ Test Source ]

Result:

✓ Website reachable
✓ Content detected
✓ 15 jobs found
✓ 8 policy articles found

[ Save & Activate ]
```

If the source fails:

```text
✗ Website unreachable

or

✗ Required content could not be detected
```

Show a useful error message.

---

# 8. SCRAPER CONFIGURATION

The scraping system must be modular.

Do NOT hardcode every website into separate application logic.

Create a generic source configuration system.

For example:

```typescript
interface SourceConfig {
  id: string;
  name: string;
  baseUrl: string;

  contentType: "JOB" | "POLICY" | "BOTH";

  method: "AUTO" | "RSS" | "API" | "SCRAPER";

  rssUrl?: string;
  apiUrl?: string;

  selectors?: {
    item?: string;
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    date?: string;
    organization?: string;
    location?: string;
    deadline?: string;
  };

  active: boolean;

  scrapeInterval?: number;
}
```

Adapt this to the existing backend technology.

---

# 9. AUTOMATIC SOURCE DETECTION

When possible, the system should automatically detect:

1. RSS feed
2. Atom feed
3. Official API
4. HTML article/job listings

Example:

```text
Website URL
     ↓
Detect RSS?
     ↓
YES → Use RSS
     ↓
NO
     ↓
Detect API?
     ↓
YES → Use API
     ↓
NO
     ↓
Use configured scraper
```

Do not blindly scrape websites when a proper RSS/API is available.

---

# 10. SCRAPER FIELD MAPPING

Because different websites have different HTML structures, the Admin Panel should allow an administrator to configure selectors when necessary.

Example:

```text
Job List Selector:
.job-card

Title Selector:
.job-title

Organization Selector:
.company-name

Location Selector:
.location

Deadline Selector:
.deadline

Link Selector:
a.details
```

The admin should be able to:

* Add selectors
* Edit selectors
* Test selectors
* Preview extracted content

Example:

```text
[ Test Extraction ]

Found: 20 items

Title:
✓ 20

Organization:
✓ 18

Location:
✓ 20

Deadline:
✓ 15
```

---

# 11. SOURCE MANAGEMENT TABLE

Admin should see:

```text
Sources

Name          Type       Method    Status    Last Sync
-------------------------------------------------------
Example Jobs  JOB        RSS       Active    2 min ago
Example News  POLICY     SCRAPER   Active    5 min ago
Example       BOTH       API       Failed    1 hour ago
```

Actions:

```text
View
Edit
Test
Sync Now
Enable
Disable
Delete
```

---

# 12. MANUAL SYNC

Admin should be able to manually trigger scraping.

Example:

```text
Sources
   ↓
Example Jobs
   ↓
[ Sync Now ]
```

Then show:

```text
Sync started...

15 new items found
3 duplicates skipped
2 updated
0 errors
```

---

# 13. AUTOMATIC BACKGROUND SYNC

The backend should automatically fetch sources periodically.

Example:

```text
Every 30 minutes

        ↓

Source Scheduler

        ↓

Active Sources

        ↓

RSS / API / Scraper

        ↓

Normalize Data

        ↓

Duplicate Detection

        ↓

Database
```

The interval must be configurable per source if practical.

Respect:

* Rate limits
* robots.txt
* Terms of Service
* Website policies
* Appropriate request frequency

---

# 14. JOB DATA

Normalize job information into a common model.

Fields should include:

```text
id
title
organization
location
employmentType
category
salary
description
requirements
deadline
publishedAt
sourceName
sourceUrl
originalUrl
createdAt
updatedAt
```

Not every source will provide every field, so fields should be optional where necessary.

---

# 15. POLICY / ARTICLE DATA

Normalize policy/article information into:

```text
id
title
summary
content/excerpt
category
imageUrl
publishedAt
sourceName
sourceUrl
originalUrl
createdAt
updatedAt
```

Do not unnecessarily copy entire copyrighted articles.

Prefer:

```text
Title
Short summary/excerpt
Source
Publication date
Original URL
```

and allow the user to open the original source.

Respect copyright and licensing requirements.

---

# 16. DUPLICATE DETECTION

Implement strong duplicate detection.

Use:

* Original URL
* Normalized title
* Source
* Organization
* Publication date
* Content similarity where appropriate

Example:

```text
Source A → "Software Engineer Needed"
Source B → "Software Engineer Needed"

        ↓

Same content detected

        ↓

Store once
```

Do not show duplicate items repeatedly to users.

---

# 17. USER AUTHENTICATION

The mobile application should have its own user authentication system.

Implement:

```text
Register
Login
Logout
Forgot Password
Reset Password
Change Password
Profile
```

Depending on the existing architecture, support:

```text
Email + Password
```

Optionally:

```text
Google Login
Apple Login
```

if appropriate.

---

# 18. USER ROLES

At minimum:

```text
USER
ADMIN
```

The backend must enforce authorization.

Example:

```text
USER
 ├── View Jobs
 ├── View Policies
 ├── Search
 ├── Save/Favorite
 └── Manage Profile

ADMIN
 ├── Everything USER can do
 ├── Manage Sources
 ├── Manage Jobs
 ├── Manage Policies
 ├── Manage Users
 ├── View Analytics
 └── Manage System Settings
```

---

# 19. USER PROFILE

Create a user profile section.

Allow users to manage:

```text
Name
Email
Profile Photo
Password
Notification Preferences
Preferred Job Categories
Preferred Locations
```

---

# 20. USER FEATURES

Users should be able to:

* Browse jobs
* Browse policies
* Search
* Filter
* Save/favorite jobs
* Save/favorite policies
* Share content
* Open original source
* Receive notifications if implemented
* Manage profile

---

# 21. MOBILE UI — GLUESTACK UI

For the mobile application, use **GlueStack UI** for the new UI components.

Do NOT replace the entire existing mobile application UI unnecessarily.

Instead:

* Reuse existing screens/components where appropriate.
* Gradually integrate GlueStack UI.
* Use GlueStack UI for new Jobs, Policies, Authentication, Profile and related screens.
* Maintain a consistent visual system.

The mobile UI should be:

* Modern
* Clean
* Responsive
* Accessible
* Fast
* Easy to navigate

---

# 22. MOBILE NAVIGATION

Integrate the new sections into the existing navigation.

A possible structure:

```text
Home
Jobs
Policies
Saved
Profile
```

If the existing navigation is different, adapt to it rather than replacing it.

---

# 23. JOB SCREEN

Create a modern Jobs feed using GlueStack UI.

Features:

```text
Search Jobs

Filters
[Category]
[Location]
[Organization]
[Employment Type]

Job Card

Title
Organization
Location
Deadline
Published Date
Source

[View Details]
```

Job details:

```text
Job Title
Organization
Location
Employment Type
Description
Requirements
Deadline
Source

[Apply / View Original Posting]
```

---

# 24. POLICY SCREEN

Create a Policy feed.

Features:

```text
Search

Categories

Policy Card

Title
Summary
Source
Published Date

[Read More]
```

Policy details should provide:

```text
Title
Summary
Source
Publication Date

[Read Original Article]
```

---

# 25. SEARCH AND FILTERING

Implement efficient backend filtering.

Examples:

```text
GET /api/jobs?search=developer
GET /api/jobs?location=Addis Ababa
GET /api/jobs?category=Technology

GET /api/policies?search=economy
GET /api/policies?category=Government
```

Support pagination.

---

# 26. ADMIN CONTENT MANAGEMENT

The Admin Panel should also allow administrators to:

### Jobs

* View collected jobs
* Search
* Filter
* Delete
* Hide
* Feature
* Edit metadata if necessary

### Policies

* View collected policies
* Search
* Filter
* Delete
* Hide
* Feature
* Edit metadata if necessary

Avoid editing the original source content unnecessarily.

---

# 27. USER MANAGEMENT

Admin Panel should include:

```text
Users

Name
Email
Role
Status
Created At
Last Login
```

Actions:

```text
View
Change Role
Disable
Enable
Delete
```

Admin should be able to disable problematic accounts.

---

# 28. SECURITY

Security is extremely important.

Implement:

* Secure password hashing
* Authentication tokens/session management
* Role-based authorization
* Protected admin routes
* Protected admin APIs
* Input validation
* Rate limiting where appropriate
* Secure HTTP headers
* CSRF protection where applicable
* Proper CORS configuration
* Environment variables for secrets

Never expose:

```text
Database credentials
API keys
JWT secrets
Scraping credentials
Admin secrets
```

to the mobile application.

---

# 29. DATABASE

Design the database around entities such as:

```text
User
Role
Source
Job
Policy
Favorite
ScrapeRun
ScrapeError
Notification
```

Adapt the exact schema to the existing database and ORM.

Use migrations.

Add appropriate indexes for:

```text
title
category
sourceId
publishedAt
deadline
location
organization
```

---

# 30. API STRUCTURE

Use the existing API architecture if one exists.

Functionality should cover:

```text
Authentication
/api/auth/register
/api/auth/login
/api/auth/logout
/api/auth/forgot-password
/api/auth/reset-password

Jobs
/api/jobs
/api/jobs/:id

Policies
/api/policies
/api/policies/:id

Sources
/api/sources

Search
/api/search

Favorites
/api/favorites

Admin
/api/admin/*
```

Do not create duplicate endpoints if equivalent functionality already exists.

---

# 31. ADMIN UI STRUCTURE

Use **shadcn/ui** and create a professional admin dashboard.

Suggested navigation:

```text
Dashboard

Content
 ├── Jobs
 └── Policies

Sources
 ├── All Sources
 ├── Add Source
 └── Scrape Logs

Users
 └── All Users

Analytics

Settings

Admin Profile
```

---

# 32. ADMIN SOURCE CREATION UX

Make adding a source easy for a non-technical administrator.

Instead of requiring the admin to understand programming, provide a guided form:

```text
Step 1 — Basic Information

Source Name
Website URL

        ↓

Step 2 — Content Type

○ Jobs
○ Policies
○ Both

        ↓

Step 3 — Collection Method

○ Auto Detect
○ RSS
○ API
○ Scraper

        ↓

Step 4 — Configure

RSS/API URL or selectors

        ↓

Step 5 — Test

[ Test Source ]

        ↓

Step 6 — Preview

Preview extracted content

        ↓

Step 7

[ Save & Activate ]
```

---

# 33. SCRAPE LOGS

Admin should be able to see scraping history.

Example:

```text
Scrape Logs

Source: Example Jobs

Time              Status    New    Updated    Errors
------------------------------------------------------
10:00             Success   15     3          0
09:30             Success   8      1          0
09:00             Failed    0      0          1
```

Clicking a failed run should show the error details.

---

# 34. CONTENT MODERATION

Because content is collected automatically, provide admin controls to:

```text
Approve
Hide
Delete
Feature
```

If practical, support an optional moderation mode:

```text
Auto Publish
```

or

```text
Require Admin Approval
```

per source.

---

# 35. NOTIFICATIONS

Prepare the architecture for notifications.

Examples:

```text
New Job matching user's preferences
New Policy article
Job deadline approaching
Important announcement
```

Do not add unnecessary infrastructure if the existing project already has notification functionality.

---

# 36. PERFORMANCE

Optimize both backend and mobile application.

Use:

* Pagination
* Database indexes
* Caching
* Lazy loading
* Image optimization
* Background jobs
* Efficient API requests
* Request deduplication

Do not load thousands of jobs/articles into the mobile application at once.

---

# 37. OFFLINE / CACHING

Where appropriate, cache recently viewed content.

If the user temporarily loses internet access, show cached content rather than a completely blank screen.

---

# 38. ERROR HANDLING

The application should gracefully handle:

```text
Network unavailable
API unavailable
Source unavailable
Scraper failure
Invalid source
Authentication failure
Expired session
Empty results
Database errors
```

Never allow one failed source to stop the entire scraping system.

---

# 39. TESTING

Before considering the feature complete, test:

### Authentication

* Register
* Login
* Logout
* Invalid credentials
* Password reset
* Role protection

### Sources

* Add source
* Edit source
* Delete source
* Enable/disable source
* Test source
* Manual sync
* Automatic sync
* Failed source

### Jobs

* Fetch
* Deduplicate
* Search
* Filter
* Pagination
* Details

### Policies

* Fetch
* Deduplicate
* Search
* Filter
* Pagination
* Details

### Admin

* Dashboard
* Users
* Sources
* Scrape logs
* Content management

### Mobile

* Login
* Jobs
* Policies
* Search
* Filters
* Favorites
* Profile
* Logout

---

# 40. IMPORTANT LEGAL / SCRAPING REQUIREMENTS

The system must not assume that every website can legally be scraped.

Before enabling a source, consider:

* Terms of Service
* robots.txt
* Copyright
* Licensing
* API usage rules
* Rate limits
* Attribution requirements

Prefer:

```text
Official API
      ↓
RSS/Atom
      ↓
Permitted scraping
```

For third-party articles, do not automatically reproduce entire copyrighted articles.

Store and display only content that is legally permitted, such as:

```text
Title
Short excerpt/summary
Source
Publication date
Original URL
```

and provide a link to the original source.

---

# 41. DEVELOPMENT STRATEGY

Work incrementally.

## Phase 1

Inspect existing project.

## Phase 2

Design database and backend architecture.

## Phase 3

Implement authentication.

## Phase 4

Implement Source Management.

## Phase 5

Implement RSS/API/Scraper engine.

## Phase 6

Implement Jobs and Policies APIs.

## Phase 7

Implement Admin Panel using shadcn/ui.

## Phase 8

Integrate mobile authentication using GlueStack UI.

## Phase 9

Integrate Jobs and Policies screens using GlueStack UI.

## Phase 10

Add search, filters, favorites and pagination.

## Phase 11

Add scraping logs and monitoring.

## Phase 12

Test the entire system.

---

# 42. CRITICAL RULES

Follow these rules throughout the implementation:

1. **Do not rewrite the existing application.**
2. **Do not delete existing functionality.**
3. **Do not change unrelated code.**
4. First inspect the existing project.
5. Reuse existing architecture wherever possible.
6. Make the source system configurable.
7. An admin must be able to add a new source from the Admin Panel without modifying source code.
8. Do not hardcode website-specific logic throughout the application.
9. Prefer API/RSS over scraping.
10. The mobile app must never directly scrape websites.
11. Scraping must happen on the backend.
12. Admin APIs must be protected by backend authorization.
13. User APIs must require authentication where appropriate.
14. Use **shadcn/ui for the Admin Panel**.
15. Use **GlueStack UI for new mobile UI**.
16. Keep the mobile UI and Admin UI visually consistent and professional.
17. Use the existing project's technologies when possible.
18. Do not introduce unnecessary dependencies.
19. Keep secrets on the server.
20. Implement proper validation and error handling.
21. Add database migrations instead of manually changing production databases.
22. Keep scraping logs.
23. Make scraping frequency configurable.
24. Support manual "Sync Now".
25. Implement duplicate detection.
26. Respect website Terms of Service, robots.txt, copyright, licensing and rate limits.

---

# 43. BEFORE YOU CODE

Before writing code, give me:

### A. Existing Project Analysis

```text
Framework:
Language:
Backend:
Database:
Authentication:
UI:
State Management:
Current Architecture:
```

### B. Proposed Architecture

Show me the new architecture.

### C. Files to Change

List the existing files/modules you will modify.

### D. Files to Create

List all important new files/modules.

### E. Database Schema

Show the proposed database entities and relationships.

### F. API Design

Show the proposed API endpoints.

### G. Admin Panel Structure

Show the proposed Admin Panel pages.

### H. Mobile Structure

Show the proposed mobile screens/navigation.

### I. Scraping Architecture

Explain exactly how a new website added from the Admin Panel will go from:

```text
Admin adds website
       ↓
Source configuration
       ↓
Test
       ↓
Activate
       ↓
Scheduler
       ↓
RSS/API/Scraper
       ↓
Normalize
       ↓
Duplicate detection
       ↓
Database
       ↓
API
       ↓
Mobile App
```

Only after this analysis should you start implementing.

# FINAL OBJECTIVE

I want a production-ready platform where:

**Admin can add a new Jobs/Policy website from the Admin Panel → configure/test it → activate it → the backend automatically collects the content → stores and normalizes it → removes duplicates → exposes it through an API → authenticated users see the content in the mobile app.**

The Admin Panel must use **shadcn/ui**.

The mobile application must use **GlueStack UI** for the new UI.

The entire system must be modular, secure, scalable, maintainable, and integrated into my existing project without unnecessarily rewriting it.
