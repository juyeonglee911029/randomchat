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
     * @returns {Promise} Resolves when ad is closed
     */
    async displayAd(type) {
        if (this.adDisplayed) return Promise.resolve();
        console.log(`[AdOptimizer] Requesting ad of type: ${type}`);
        
        return new Promise((resolve) => {
            const adOverlay = document.createElement('div');
            adOverlay.id = 'ad-overlay';
            adOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.95);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                color: white;
                font-family: 'Poppins', sans-serif;
            `;

            const adContent = document.createElement('div');
            adContent.style.cssText = `
                background: #1a1a1a;
                padding: 40px;
                border-radius: 20px;
                border: 2px solid #FFD700;
                text-align: center;
                max-width: 400px;
                width: 90%;
                position: relative;
                box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
            `;

            let timeLeft = 9;
            adContent.innerHTML = `
                <div style="margin-bottom: 25px; font-weight: 800; font-size: 1.5rem; color: #FFD700; letter-spacing: 2px;">SPONSORED AD</div>
                <div style="width: 100%; height: 200px; background: #222; display: flex; align-items: center; justify-content: center; margin: 0 auto 25px; border-radius: 10px; border: 1px solid #333;">
                    <i class="material-icons" style="font-size: 64px; color: #444;">play_circle_filled</i>
                </div>
                <button id="close-ad-btn" class="btn primary" style="width: 100%; height: 50px; font-weight: bold; opacity: 0.5; cursor: not-allowed;" disabled>
                    Close in ${timeLeft}s
                </button>
            `;

            adOverlay.appendChild(adContent);
            document.body.appendChild(adOverlay);

            const closeBtn = document.getElementById('close-ad-btn');
            const timer = setInterval(() => {
                timeLeft--;
                if (timeLeft > 0) {
                    closeBtn.textContent = `Close in ${timeLeft}s`;
                } else {
                    clearInterval(timer);
                    closeBtn.disabled = false;
                    closeBtn.style.opacity = '1';
                    closeBtn.style.cursor = 'pointer';
                    closeBtn.textContent = 'Close Ad & Start';
                }
            }, 1000);

            closeBtn.addEventListener('click', () => {
                document.body.removeChild(adOverlay);
                this.adDisplayed = false;
                resolve();
            });

            this.adDisplayed = true;
        });
    }

    /**
     * Triggered BEFORE a match is established (during search)
     * Show ad every 4 successful matches
     */
    async showAdBeforeMatch() {
        this.matchCounter++;
        if (this.matchCounter % 4 === 0) {
            await this.displayAd('interstitial');
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
