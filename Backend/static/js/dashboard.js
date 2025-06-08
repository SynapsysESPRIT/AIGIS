/**
 * AIGIS Dashboard Enhancements
 * Gold theme (#FFC300) with improved UX/UI
 */

document.addEventListener('DOMContentLoaded', function () {
    // Add subtle animations to the cards
    animateCards();

    // Add hover effects to interactive elements
    addHoverEffects();

    // Add scroll animations
    initScrollAnimations();

    // Display tooltips and popovers
    initTooltips();
});

// Add subtle fade-in animations to cards
function animateCards() {
    const cards = document.querySelectorAll('.card');

    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';

        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 + (index * 50)); // Staggered animation
    });
}

// Add hover effects to interactive elements
function addHoverEffects() {
    // Detection cards hover
    const detectionCards = document.querySelectorAll('.detection-card');

    detectionCards.forEach(card => {
        card.addEventListener('mouseenter', function () {
            this.style.transform = 'translateY(-5px)';
            this.style.boxShadow = '0 8px 15px rgba(255, 195, 0, 0.2)';
        });

        card.addEventListener('mouseleave', function () {
            this.style.transform = '';
            this.style.boxShadow = '';
        });
    });

    // Risk level cards hover
    const riskCards = document.querySelectorAll('.risk-level-card, .confidence-card, .detection-stats-card');

    riskCards.forEach(card => {
        card.addEventListener('mouseenter', function () {
            this.style.transform = 'translateY(-3px)';
            this.style.boxShadow = '0 6px 12px rgba(255, 195, 0, 0.15)';
        });

        card.addEventListener('mouseleave', function () {
            this.style.transform = '';
            this.style.boxShadow = '';
        });
    });
}

// Initialize scroll animations
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll('.card, .chart-container');

    // Create observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1
    });

    // Observe elements
    animatedElements.forEach(el => {
        observer.observe(el);
    });
}

// Initialize tooltips
function initTooltips() {
    // If using Bootstrap 5
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    if (typeof bootstrap !== 'undefined') {
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl, {
                boundary: document.body
            });
        });
    }
}

// Enhance text analysis summary display
function enhanceTextAnalysis() {
    const analysisCards = document.querySelectorAll('.card-body .d-flex.justify-content-between');

    analysisCards.forEach(item => {
        const valueElement = item.querySelector('span:nth-child(2)');
        if (valueElement && !isNaN(parseInt(valueElement.textContent))) {
            const value = parseInt(valueElement.textContent);

            // Create progress bar container
            const progressContainer = document.createElement('div');
            progressContainer.className = 'progress mt-1';
            progressContainer.style.height = '6px';

            // Create progress bar
            const progressBar = document.createElement('div');

            // Determine color class based on context
            let colorClass = 'bg-success';
            if (valueElement.classList.contains('text-danger')) {
                colorClass = 'bg-danger';
            } else if (valueElement.classList.contains('text-warning')) {
                colorClass = 'bg-warning';
            }

            // Calculate percentage (max value of 20 for demonstration)
            const percentage = Math.min(100, (value / 20) * 100);

            progressBar.className = `progress-bar ${colorClass}`;
            progressBar.style.width = `${percentage}%`;

            // Add to DOM
            progressContainer.appendChild(progressBar);
            item.appendChild(progressContainer);
        }
    });
}

// Update loading animation
function showLoading(show = true) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (!loadingOverlay) return;

    if (show) {
        loadingOverlay.classList.remove('d-none');
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.style.opacity = '1';
        }, 10);
    } else {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.classList.add('d-none');
        }, 300);
    }
}

// Format dates in a friendly way
function formatFriendlyDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHour = Math.round(diffMin / 60);

    // Less than a minute
    if (diffSec < 60) {
        return 'Just now';
    }

    // Less than an hour
    if (diffMin < 60) {
        return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    }

    // Less than a day
    if (diffHour < 24) {
        return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
    }

    // Default to formatted date
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
