# YELLOWCHAT Project Blueprint

## Project Overview
YELLOWCHAT is a real-time random video chat application built with modern web standards. It features WebRTC for video communication, Firebase for backend services (Auth, Firestore), and a responsive UI designed for both desktop and mobile.

## Implementation Details

### Core Technologies
- **Frontend:** HTML5, CSS3 (Modern Baseline), Vanilla JavaScript (ES Modules).
- **Backend:** Firebase (Authentication, Firestore, Hosting).
- **Real-time Communication:** WebRTC with Firebase as a signaling channel.
- **Visuals:** Material Icons, Google Fonts (Poppins), CSS animations for transitions.

### Key Features
- **Anonymous & Google Login:** Users can join anonymously or sign in with Google. Fixed Google login functionality and ID display.
- **Random Matching:** Intelligent matching based on gender preferences (Premium).
- **Real-time Chat:** Integrated text chat alongside video.
- **Visual Effects:** Brightness control and mirror toggle for local video.
- **Social Integration:** Instagram and WhatsApp ID sharing.
- **Friends System:** Search, add, and call friends directly.
- **Ad Integration:** Sponsored ads appear strictly every 3 clicks of "Find Stranger" for non-premium users.
- **Free Pass (Premium):** Subscription-based access to gender filtering and ad-free experience.
- **Draggable Webcam:** Users can move their own video feed around the screen with boundary constraints. Restricted from moving outside the video container and cannot enter the chat area on mobile.

## Recent Updates & Current Tasks

### UI/Layout Adjustments
- **Header Restoration:** Restored the original header height (70px) and logo design. Logo text "YELLOW" is primary yellow, and "CHAT" is white.
- **Logo & Stats:** `YELLOWCHAT` logo overlay and `Online Count` are positioned at the top-right of the video area, with proper spacing.
- **Timer Removal:** Removed the call timer overlay from the video area as requested.
- **Mobile Chat:** Full-width chat container at the bottom of the screen (fixed position) for better usability on mobile devices.

### Matching & Ad Logic
- **Ad Frequency:**
    - Sponsored ads appear strictly after every 3 clicks of the "Find Stranger" button for non-premium users.
    - Other actions (Stop, Friends, etc.) do not trigger ads.
- **Auto-Matching:** Retries matching every 5 seconds if no partner is found.

### Project Structure
- `index.html`: Main entry point and UI structure.
- `css/style.css`: Modern CSS with container queries and mobile-first design.
- `js/main.js`: App initialization, event listeners, auth state, and dragging logic.
- `js/webrtc.js`: WebRTC connection and media handling.
- `js/chat.js`: Firebase Firestore based chat logic.
- `js/ads.js`: Ad placement and optimization logic.
- `js/friends.js`: Social features and direct calling.
- `js/i18n.js`: Multi-language support.
