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

## Recent Changes (March 10, 2026)
- **Header:** Modified to hide Google user information (#userInfo) on mobile devices to save space and improve focus on controls.
- **UI Layout:** 
    - Moved local video (.local-wrapper) to the bottom-right corner.
    - Repositioned video controls (.video-controls-bottom) to stay on the bottom-left, ensuring they are opposite to the video logo overlay (top-right).
    - On mobile, ensured elements don't overlap by positioning them in opposite corners.

## Implementation Steps
1.  Identify `#userInfo` in CSS and apply `display: none !important` within the 768px media query.
2.  Update `.local-wrapper` CSS to use `right: 20px` (desktop) and `right: 10px` (mobile), while setting `left: auto`.
3.  Verify `.video-controls-bottom` remains at `left: 20px` (desktop) and `left: 10px` (mobile).
