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
- **Anonymous & Google Login:** Users can join anonymously or sign in with Google.
- **Random Matching:** Intelligent matching based on gender preferences (Premium).
- **Real-time Chat:** Integrated text chat alongside video.
- **Visual Effects:** Brightness control and mirror toggle for local video.
- **Social Integration:** Instagram and WhatsApp ID sharing.
- **Friends System:** Search, add, and call friends directly.
- **Ad Integration:** Optimized ad placements to balance monetization and UX.
- **Free Pass (Premium):** Subscription-based access to gender filtering and ad-free experience.

## Recent Updates & Current Tasks

### Reverted to stable version (48e01d7)
- Restored baseline functionality for matching and Free Pass.

### Planned Enhancements (Current Directive)

#### UI/Layout Adjustments
- **Online Indicator:** Change icon color to green (#4CAF50) to clearly signify active status.
- **Overlay Fixes:** 
    - Move `onlineCount` and `callTimer` to the bottom of the video area to avoid overlap with the `YELLOWCHAT` logo.
    - Resolve margin issues between the logo and status indicators.
- **Chat Area:** Increase the width of the chat container to ~450px for a more balanced layout.
- **Mobile Layout:** Raise the local video preview height (margin-bottom) on mobile to ensure it doesn't overlap with the chat input area.
- **Friends Sidebar:** Implement a professional left-aligned friends list within the chat/friends area.

#### Matching & Ad Logic
- **Stranger Find:** 
    - Trigger automatic random matching immediately on click.
    - Remove the hard block/payment requirement for clicking "Find Stranger".
- **Ad Frequency:** 
    - Show ads every 4 successful matches.
    - Ads should only appear *during* the matching process, never during an active chat session.
    - Suppress "Free Pass" popups during active matching if not required by current frequency.
- **Button Styling:** Update the "FREE PASS" button color and state dynamically based on user membership.

#### Friends Feature
- **Professional UI:**
    - Display Google profile pictures in the friends list.
    - Add "Chat", "Call", and "Block" buttons for each friend.
    - Limit visible friends to 10 with a scrollable container for additional entries.
    - Place the friends list on the left side of the chat interface.

## Project Structure
- `index.html`: Main entry point and UI structure.
- `css/style.css`: Comprehensive styling for all components.
- `js/main.js`: Core application logic and event handling.
- `js/webrtc.js`: WebRTC connection and media handling.
- `js/chat.js`: Messaging logic.
- `js/friends.js`: Friend management and direct calling.
- `js/ads.js`: Ad placement and optimization logic.
- `js/firebase-config.js`: Firebase initialization.
- `js/i18n.js`: Internationalization (multi-language support).
