# YELLOWCHAT Project Blueprint

## Overview
YELLOWCHAT is a real-time random video chat application built with framework-less web standards (HTML, CSS, JS) and Firebase.

## Design & Features
- **Modern Aesthetic:** Dark theme with vibrant yellow primary color.
- **Responsive Layout:** Adaptive design for desktop and mobile.
- **Header:** Contains logo, match controls, and user authentication status.
- **Video Container:** Main area for remote video with a small overlay for local video.
- **Video Controls:** Bottom overlay bar for mic toggle, brightness, mirroring, and volume.
- **Chat:** Sidebar (desktop) or bottom section (mobile) for text communication.
- **Animations:** Floating logo, matching overlay, and transition effects.
- **Premium Effects:** Subtle noise texture, multi-layered drop shadows, and glow effects on interactive elements.

## Recent Changes (March 13, 2026)
- **Layout & UI Overhaul:**
    - **SEO Content Removal:** Cleaned up the landing page by removing the `seo-content` section and footer elements.
    - **Mobile Top Bar Optimization:** Refined the header for mobile screens to ensure "Find Stranger", "Stop", "Friends", and "Settings" buttons all fit on a single row without wrapping. Uniformly reduced button sizes for a cleaner look.
    - **Chat UI Refinement:** Moved the chat input field above the message area. Simplified the chat UI and enforced a strict 10-message visible limit for improved clarity and performance.
    - **Local Video Layout Fix:** Resolved a bug where the local video preview was becoming "twisted" or distorted. Refined the boundary logic for the draggable local video container to ensure it stays correctly within the main rectangular border.

## Implementation Steps
1.  Identify `#userInfo` in CSS and apply `display: none !important` within the 768px media query.
2.  Update `.local-wrapper` CSS to use `right: 20px` (desktop) and `right: 10px` (mobile), while setting `left: auto`.
3.  Verify `.video-controls-bottom` remains at `left: 20px` (desktop) and `left: 10px` (mobile).
