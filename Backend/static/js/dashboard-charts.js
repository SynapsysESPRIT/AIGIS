/**
 * Enhanced Chart.js Configuration for AIGIS Dashboard
 * Using #FFC300 (gold) color palette
 */

// Global Chart.js defaults based on our theme
Chart.defaults.font.family = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = "#333333";
Chart.defaults.borderColor = "rgba(255, 195, 0, 0.1)";
Chart.defaults.plugins.tooltip.backgroundColor = "rgba(39, 39, 39, 0.9)";
Chart.defaults.plugins.tooltip.titleColor = "#FFC300";
Chart.defaults.plugins.tooltip.bodyColor = "#FFFFFF";
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.borderColor = "#FFC300";
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.displayColors = true;
Chart.defaults.plugins.tooltip.boxPadding = 6;

// Dashboard color scheme
const dashboardColors = {
    primary: "#FFC300",
    secondary: "#FF9500",
    danger: "#FF5733",
    success: "#5BD858",
    warning: "#FFD60A",
    info: "#34B7EB",
    gray: "#707070",
    light: "#FFF5E1",
    dark: "#272727"
};

// Theme gradients for chart backgrounds
const chartGradients = {
    primary: (ctx) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(255, 195, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 195, 0, 0.05)');
        return gradient;
    },
    secondary: (ctx) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(255, 149, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 149, 0, 0.05)');
        return gradient;
    },
    danger: (ctx) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(255, 87, 51, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 87, 51, 0.05)');
        return gradient;
    },
    success: (ctx) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(91, 216, 88, 0.4)');
        gradient.addColorStop(1, 'rgba(91, 216, 88, 0.05)');
        return gradient;
    }
};

// Enhanced detection chart options
function getDetectionChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            intersect: false,
            mode: 'index',
        },
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    padding: 15,
                    font: {
                        size: 12,
                        weight: 'bold'
                    }
                }
            },
            tooltip: {
                enabled: true,
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function (context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        const value = context.parsed.y;
                        if (value !== null) {
                            if (Number.isInteger(value)) {
                                label += value + '%';
                            } else {
                                label += value.toFixed(2) + '%';
                            }
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: {
                    display: false,
                    drawBorder: false
                },
                ticks: {
                    maxRotation: 45,
                    minRotation: 45
                }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    callback: value => `${(value * 100).toFixed(0)}%`,
                    padding: 10
                },
                grid: {
                    color: 'rgba(255, 195, 0, 0.1)',
                    drawBorder: false
                }
            }
        }
    };
}

// Enhanced usage pattern chart options
function getUsagePatternChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            intersect: false,
            mode: 'index',
        },
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    padding: 15,
                    font: {
                        size: 12,
                        weight: 'bold'
                    }
                }
            }
        },
        scales: {
            x: {
                grid: {
                    display: false,
                    drawBorder: false
                },
                ticks: {
                    maxRotation: 45,
                    minRotation: 45
                }
            },
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Duration (seconds)',
                    font: {
                        size: 12,
                        weight: 'bold'
                    }
                },
                grid: {
                    color: 'rgba(255, 195, 0, 0.1)',
                    drawBorder: false
                }
            }
        }
    };
}

// Apply hover animation to chart datasets
function applyChartHoverEffects(chart) {
    const originalPointRadius = 3;
    const hoverPointRadius = 6;

    chart.options.plugins.tooltip = chart.options.plugins.tooltip || {};
    chart.options.plugins.tooltip.callbacks = chart.options.plugins.tooltip.callbacks || {};

    chart.options.plugins.tooltip.callbacks.labelPointStyle = function (context) {
        return {
            pointStyle: 'circle',
            rotation: 0
        };
    };

    chart.update();
}

// Create animated progress bar for risk indicators
function createAnimatedProgressBar(elementId, percentage, colorClass = 'bg-warning') {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'progress';
    container.style.height = '10px';
    container.style.borderRadius = '5px';
    container.style.backgroundColor = 'rgba(0,0,0,0.05)';

    const progressBar = document.createElement('div');
    progressBar.className = `progress-bar ${colorClass}`;
    progressBar.style.width = '0%';
    progressBar.style.transition = 'width 1s ease-in-out';
    progressBar.style.borderRadius = '5px';

    container.appendChild(progressBar);
    element.appendChild(container);

    // Add percentage text
    const percentText = document.createElement('div');
    percentText.className = 'text-end mt-1';
    percentText.style.fontSize = '0.75rem';
    percentText.style.fontWeight = 'bold';
    percentText.style.color = '#707070';
    percentText.textContent = `${percentage}%`;
    element.appendChild(percentText);

    // Animate progress bar
    setTimeout(() => {
        progressBar.style.width = `${percentage}%`;
    }, 200);
}
