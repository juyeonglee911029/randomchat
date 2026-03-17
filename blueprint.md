# YELLOWCHAT Project Blueprint

## Overview
YELLOWCHAT is a real-time random video chat application built with framework-less web standards (HTML, CSS, JS) and Firebase.

## Design & Features
- **Modern Aesthetic:** Dark theme with vibrant yellow primary color.
- **Responsive Layout:** Adaptive design for desktop and mobile.
- **Ad Revenue Optimization:** 
    - `AdOptimizer` class for managing ad lifecycle.
    - Ads displayed: after match, exit intent, idle (30s), banner during matching, rewarded for friend add.
- **Enhanced Friend System:**
    - Real-time friend requests (pending/accept/decline).
    - Duplicate request prevention.
    - Improved friend list UI/UX.
    - Notification system for incoming requests.
- **Monetization (Subscription):**
    - Gender-based matching requires a monthly subscription.
    - Payment integration (Credit card/Gateway).
- **SEO & Localization:**
    - Multi-language support (English, Spanish, Portuguese).
    - Dynamic meta tags and SEO keywords for South American markets.
    - Blog section for content marketing.

## Implementation Status

### Phase 1: Ad Optimization & Base UI (COMPLETED)
- Implemented `AdOptimizer` class in `js/ads.js`.
- Integrated match ads, exit intent, and idle detection.
- Added Payment/Subscription modal for Premium.

### Phase 2: Enhanced Friend System (COMPLETED)
- Added `friendRequests` logic in `js/friends.js`.
- Implemented Pending / Accept / Decline workflows.
- Updated Friend List UI to show requests and friends separately.
- Integrated Rewarded Ads for friend addition.

### Phase 3: Monetization & SEO (COMPLETED)
- Implemented mock checkout for Premium status.
- Added i18n support (English, Spanish, Portuguese) in `js/i18n.js`.
- Added dynamic meta tags for SEO.
- Added Blog section link in header.

## Recent Changes (March 17, 2026)
- **Initiated Revenue & Feature Optimization:**
    - Planned `AdOptimizer` for maximized revenue.
    - Planned real-time friend request system.
    - Planned subscription-based gender matching.
