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

## Recent Changes (March 11, 2026)
- **Robust WebRTC Architecture (Omegle-style):**
    - **Atomic Joining:** Implemented Firestore Transactions (`runTransaction`) to ensure only one user can join a waiting room, eliminating race conditions where three people end up in one room.
    - **Signaling Subcollections:** Moved ICE candidates to a dedicated `candidates` subcollection. This ensures faster updates and prevents the main room document from hitting size limits.
    - **Safe ICE Queuing:** Added a robust queuing mechanism for remote ICE candidates that arrive before the WebRTC handshake is ready to receive them.
    - **Synchronized Cleanup:** Improved `hangup()` to thoroughly delete rooms and all related signaling data in the background.
    - **UI Stability:** Refined the matching loop to prevent it from interrupting active connection attempts, ensuring a smoother "Connecting..." phase.

## Implementation Steps
1.  Identify `#userInfo` in CSS and apply `display: none !important` within the 768px media query.
2.  Update `.local-wrapper` CSS to use `right: 20px` (desktop) and `right: 10px` (mobile), while setting `left: auto`.
3.  Verify `.video-controls-bottom` remains at `left: 20px` (desktop) and `left: 10px` (mobile).
