/**
 * AdOptimizer handles advertisement lifecycle and triggers based on user behavior.
 */
export class AdOptimizer {
    constructor() {
        this.adDisplayed = false;
        this.clickCounter = 0;
    }

    /**
     * Tracks button clicks. Shows an ad every 3 clicks for non-premium users.
     * @param {boolean} isPremium - Whether the user has a FREE PASS
     * @returns {Promise} Resolves when ad is finished/closed or immediately if no ad
     */
    async trackClick(isPremium) {
        if (isPremium) return Promise.resolve();
        
        this.clickCounter++;
        console.log(`[AdOptimizer] Click count: ${this.clickCounter}`);
        
        if (this.clickCounter % 3 === 0) {
            return await this.displayAd('interstitial');
        }
        
        return Promise.resolve();
    }

    /**
     * Display an ad with a 9-second countdown
     * @param {string} type - 'interstitial', 'rewarded'
     */
    async displayAd(type) {
        if (this.adDisplayed) return Promise.resolve();
        this.adDisplayed = true;

        return new Promise((resolve) => {
            const adOverlay = document.createElement('div');
            adOverlay.id = 'ad-overlay';
            adOverlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.95); display: flex; justify-content: center;
                align-items: center; z-index: 10000; font-family: 'Poppins', sans-serif;
            `;

            const adContent = document.createElement('div');
            adContent.style.cssText = `
                background: #1a1a1a; padding: 40px; border-radius: 20px;
                border: 2px solid #FFD700; text-align: center; max-width: 400px;
                width: 90%; box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
            `;

            let timeLeft = 9;
            adContent.innerHTML = `
                <div style="margin-bottom: 25px; font-weight: 800; font-size: 1.5rem; color: #FFD700; letter-spacing: 2px;">SPONSORED AD</div>
                <div style="width: 100%; height: 200px; background: #222; display: flex; align-items: center; justify-content: center; margin-bottom: 25px; border-radius: 10px;">
                    <i class="material-icons" style="font-size: 64px; color: #444;">play_circle_filled</i>
                </div>
                <button id="close-ad-btn" class="btn primary" style="width: 100%; height: 50px; font-weight: bold; border: none; border-radius: 10px; background: #FFD700; color: #000; opacity: 0.5; cursor: not-allowed;" disabled>
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
                    closeBtn.textContent = 'Close Ad & Continue';
                }
            }, 1000);

            closeBtn.onclick = () => {
                document.body.removeChild(adOverlay);
                this.adDisplayed = false;
                if (type === 'rewarded') {
                    window.dispatchEvent(new CustomEvent('ad-reward-completed'));
                }
                resolve();
            };
        });
    }

    /**
     * Legacy method preserved for compatibility
     */
    async showAdBeforeMatch(isPremium) {
        return await this.trackClick(isPremium);
    }

    showRewardedAd() {
        this.displayAd('rewarded');
    }
}

export const adOptimizer = new AdOptimizer();
