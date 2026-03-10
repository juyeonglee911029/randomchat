# Blueprint: YELLOWCHAT

## Overview
YELLOWCHAT is a framework-less web application for anonymous video chatting, built with modern web standards and integrated with Firebase. It features real-time video streaming (WebRTC), instant messaging, and user authentication via Google or anonymously.

## Project Details & Features

### 1. Architecture
- **Framework-less:** Pure HTML, CSS, and JavaScript.
- **Firebase Integration:** Uses Firebase Auth for user management and Firestore for real-time signaling and user data.
- **WebRTC:** Peer-to-peer video/audio connection for the chat experience.
- **Responsive Design:** Adapts to desktop and mobile viewports.

### 2. UI/UX Design
- **Color Palette:** Dark theme (`#121212`) with vibrant Yellow (`#FFD700`) as the primary accent.
- **Header:** Contains the logo and user authentication/controls.
- **Main Layout:** 
  - Left Sidebar: Placeholder for AdSense.
  - Center Area: Remote video stream with local video overlay (draggable).
  - Right Sidebar: Chat interface.
- **Modern Effects:** Animated gradient headers, glassmorphism for video controls, and pulse animations for the matching state.

### 3. Core Features
- **Google & Anonymous Login:** Seamless entry into the app.
- **Gender Selection:** One-time selection for improved matching logic.
- **Stranger Matching:** Finds and connects users based on preferences.
- **Real-time Chat:** Instant text communication during video sessions.
- **Video Controls:** Toggle mic, adjust volume, brightness, and mirror view.
- **Social Sharing:** Option to share Instagram ID and WhatsApp number with the partner.

## Current Requested Changes

### Header Layout Update
- **Goal:** Place the Logo on the left and the Google ID (User Info) on the right in a single line to maximize chat space.
- **Steps:**
  - Modify `index.html` to restructure the header content.
  - Move the Google ID container next to the main control buttons.
  - Update `css/style.css` to handle the new horizontal alignment.

### Visual Polishing
- **Goal:** Add a custom yellow scrollbar for a more themed appearance.
- **Steps:**
  - Add CSS `::-webkit-scrollbar` styles to `css/style.css`.
  - Ensure the scrollbar thumb is yellow (`#FFD700`).

### Auto-Scroll Fix
- **Goal:** Ensure the chat automatically scrolls to the bottom when new messages arrive.
- **Steps:**
  - Update `js/main.js` to target the correct scrollable container (`chat-messages`).

## Implementation Log (Current Session)
1. **Blueprint Creation:** Initialized `blueprint.md`.
2. **Header Restructuring:** Updated `index.html` to place Logo on left and User Info on right.
3. **CSS Styling:** Updated `css/style.css` for horizontal header alignment and yellow scrollbar.
4. **Auto-Scroll Fix:** Updated `js/main.js` to correctly target the scrollable chat container.
