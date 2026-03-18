/**
 * AdOptimizer handles advertisement lifecycle and triggers based on user behavior.
 */
export class AdOptimizer {
    constructor() {
        this.adDisplayed = false;
        this.sessionStartTime = Date.now();
        this.idleTimeout = 30000; // 30 seconds
        this.idleTimer = null;
        this.matchCounter = 0; // Track successful matches
        
        this.init();
    }

    init() {
        this.detectExitIntent();
        this.detectIdleTime();
        console.log("AdOptimizer initialized.");
    }

    /**
     * Display an ad based on type
     * @param {string} type - 'interstitial', 'exit-intent', 'idle', 'banner', 'rewarded'
     */
    displayAd(type) {
        console.log(`[AdOptimizer] Requesting ad of type: ${type}`);
        
        // This is a placeholder for actual ad provider integration (e.g., Google Publisher Tags)
        const adOverlay = document.createElement('div');
        adOverlay.id = 'ad-overlay';
        adOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.85);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            color: white;
            font-family: 'Poppins', sans-serif;
        `;

        const adContent = document.createElement('div');
        adContent.style.cssText = `
            background: #222;
            padding: 30px;
            border-radius: 15px;
            border: 2px solid #ffcc00;
            text-align: center;
            max-width: 90%;
            position: relative;
        `;

        adContent.innerHTML = `
            <div style="margin-bottom: 20px; font-weight: bold; font-size: 1.2rem;">SPONSORED AD</div>
            <div style="width: 300px; height: 250px; background: #333; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                <span style="color: #666;">Ad Content Area</span>
            </div>
            <button id="close-ad-btn" class="btn primary" style="width: 100%;">Close Ad</button>
        `;

        adOverlay.appendChild(adContent);
        document.body.appendChild(adOverlay);

        document.getElementById('close-ad-btn').addEventListener('click', () => {
            document.body.removeChild(adOverlay);
            this.adDisplayed = false;
            if (type === 'rewarded') {
                window.dispatchEvent(new CustomEvent('ad-reward-completed'));
            }
        });

        this.adDisplayed = true;
    }

    /**
     * Triggered BEFORE a match is established (during search)
     * Show ad every 4 successful matches
     */
    showAdBeforeMatch() {
        this.matchCounter++;
        if (this.matchCounter % 4 === 0 && !this.adDisplayed) {
            this.displayAd('interstitial');
        }
    }

    /**
     * Detects when user moves mouse to the top of the screen (potential exit)
     */
    detectExitIntent() {
        document.addEventListener('mouseleave', (e) => {
            if (e.clientY < 10 && !this.adDisplayed) {
                this.displayAd('exit-intent');
            }
        });
    }

    /**
     * Detects idle time and shows an ad after 30 seconds of inactivity
     */
    detectIdleTime() {
        const resetIdle = () => {
            clearTimeout(this.idleTimer);
            this.idleTimer = setTimeout(() => {
                if (!this.adDisplayed) {
                    this.displayAd('idle');
                }
            }, this.idleTimeout);
        };
        
        ['mousemove', 'keypress', 'click', 'touchstart'].forEach(event => {
            document.addEventListener(event, resetIdle);
        });
        
        resetIdle();
    }

    /**
     * Show rewarded ad for friend addition
     */
    showRewardedAd() {
        this.displayAd('rewarded');
    }
}

export const adOptimizer = new AdOptimizer();
