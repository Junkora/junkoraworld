// Mobile Navigation Toggle
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    });
});

// Smooth Scrolling for Navigation Links (skip bare "#" to avoid invalid selector)
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (!href || href === '#') {
            // Let other handlers (e.g., Discord modal) handle it
            e.preventDefault();
            return;
        }
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Animated Counter for Statistics
const animateCounter = (element, target) => {
    let current = 0;
    const increment = target / 100;
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current).toLocaleString();
    }, 20);
};

// Intersection Observer for Counter Animation
const observerOptions = {
    threshold: 0.5,
    rootMargin: '0px 0px -100px 0px'
};

const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const statNumbers = entry.target.querySelectorAll('.stat-number');
            statNumbers.forEach(stat => {
                const target = parseInt(stat.getAttribute('data-count'));
                animateCounter(stat, target);
            });
            counterObserver.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe the stats section
const statsSection = document.querySelector('.stats');
if (statsSection) {
    counterObserver.observe(statsSection);
}

/* Parallax Effect for Hero Section (updated for hero-image) */
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const heroContent = document.querySelector('.hero-content');
    const heroImage = document.querySelector('.hero-image');
    
    if (heroContent) {
        heroContent.style.transform = `translateY(${scrolled * 0.5}px)`;
    }
    if (heroImage) {
        heroImage.style.transform = `translateY(${scrolled * 0.3}px)`;
    }
});

// Typing Effect for Hero Title
const typeWriter = (element, text, speed = 100) => {
    let i = 0;
    element.textContent = '';
    
    const type = () => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    };
    
    type();
};

// Initialize typing effect when page loads
window.addEventListener('load', () => {
    const glitchElement = document.querySelector('.glitch');
    if (glitchElement) {
        const originalText = glitchElement.textContent;
        setTimeout(() => {
            typeWriter(glitchElement, originalText, 150);
        }, 500);
    }
});

// Button Click Effects
document.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('click', function(e) {
        // Create ripple effect
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple');
        
        this.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    });
});

// Add ripple effect styles
const style = document.createElement('style');
style.textContent = `
    .btn {
        position: relative;
        overflow: hidden;
    }
    
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.3);
        transform: scale(0);
        animation: ripple-animation 0.6s ease-out;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Game Card Hover Effects
document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-10px) rotateX(5deg)';
    });
    
    card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0) rotateX(0)';
    });
});

// Form Submission Handler
const contactForm = document.querySelector('.contact-form form');
if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get form data
        const formData = new FormData(this);
        const callsign = this.querySelector('input[type="text"]').value;
        const email = this.querySelector('input[type="email"]').value;
        const message = this.querySelector('textarea').value;
        
        // Simulate form submission
        const submitButton = this.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        
        submitButton.textContent = 'TRANSMITTING...';
        submitButton.disabled = true;
        
        setTimeout(() => {
            submitButton.textContent = 'MESSAGE SENT';
            submitButton.style.background = 'linear-gradient(45deg, #00ff41, #00cc33)';
            
            // Reset form
            this.reset();
            
            setTimeout(() => {
                submitButton.textContent = originalText;
                submitButton.style.background = '';
                submitButton.disabled = false;
            }, 3000);
        }, 2000);
    });
}

// Scroll-based Header Background
window.addEventListener('scroll', () => {
    const header = document.querySelector('.header');
    const scrolled = window.pageYOffset;
    
    if (scrolled > 100) {
        header.style.background = 'rgba(10, 10, 10, 0.98)';
        header.style.backdropFilter = 'blur(15px)';
    } else {
        header.style.background = 'rgba(10, 10, 10, 0.95)';
        header.style.backdropFilter = 'blur(10px)';
    }
});

// Add glow effect to buttons on hover
document.querySelectorAll('.btn-primary, .btn-game').forEach(button => {
    button.addEventListener('mouseenter', function() {
        this.style.boxShadow = '0 0 20px rgba(255, 107, 53, 0.6), 0 0 40px rgba(255, 107, 53, 0.3)';
    });
    
    button.addEventListener('mouseleave', function() {
        this.style.boxShadow = '';
    });
});

// Particle Effect for Hero Section
class Particle {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 1;
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
        this.opacity = Math.random() * 0.5 + 0.2;
    }
    
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        
        if (this.x > this.canvas.width) this.x = 0;
        if (this.x < 0) this.x = this.canvas.width;
        if (this.y > this.canvas.height) this.y = 0;
        if (this.y < 0) this.y = this.canvas.height;
    }
    
    draw() {
        this.ctx.fillStyle = `rgba(255, 107, 53, ${this.opacity})`;
        this.ctx.fillRect(this.x, this.y, this.size, this.size);
    }
}

// Initialize particle system
const heroSection = document.querySelector('.hero');
if (heroSection) {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '1';
    
    heroSection.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    const particles = [];
    
    function resizeCanvas() {
        canvas.width = heroSection.offsetWidth;
        canvas.height = heroSection.offsetHeight;
    }
    
    function createParticles() {
        particles.length = 0;
        for (let i = 0; i < 50; i++) {
            particles.push(new Particle(canvas));
        }
    }
    
    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });
        
        requestAnimationFrame(animateParticles);
    }
    
    resizeCanvas();
    createParticles();
    animateParticles();
    
    window.addEventListener('resize', () => {
        resizeCanvas();
        createParticles();
    });
}

/* Three.js Interconnecting Lines network for About section */
(function initNetwork() {
    const container = document.getElementById('network-container');
    if (!container || typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        1,
        1000
    );
    camera.position.z = 120;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0); // transparent
    container.appendChild(renderer.domElement);

    // Points (nodes)
    const POINTS = 120;
    const RANGE = 100;
    const CONNECT_DIST = 22;
    const SPEED = 0.15;

    const positions = new Float32Array(POINTS * 3);
    const velocities = new Float32Array(POINTS * 3);

    for (let i = 0; i < POINTS; i++) {
        positions[i * 3 + 0] = (Math.random() - 0.5) * 2 * RANGE;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 2 * RANGE;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 2 * RANGE;

        velocities[i * 3 + 0] = (Math.random() - 0.5) * SPEED;
        velocities[i * 3 + 1] = (Math.random() - 0.5) * SPEED;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * SPEED;
    }

    const dotsGeo = new THREE.BufferGeometry();
    dotsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dotsMat = new THREE.PointsMaterial({ color: 0xf7931e, size: 2, sizeAttenuation: true });
    const dots = new THREE.Points(dotsGeo, dotsMat);
    scene.add(dots);

    // Pre-allocate line buffer (worst-case)
    const linePositions = new Float32Array(POINTS * POINTS * 6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff6b35, transparent: true, opacity: 0.35 });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lines);

    function resize() {
        const w = container.clientWidth || 300;
        const h = container.clientHeight || 200;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    function animate() {
        // Move points
        for (let i = 0; i < POINTS; i++) {
            let ix = i * 3;
            positions[ix] += velocities[ix];
            positions[ix + 1] += velocities[ix + 1];
            positions[ix + 2] += velocities[ix + 2];

            // Bounce inside range cube
            for (let a = 0; a < 3; a++) {
                if (positions[ix + a] > RANGE || positions[ix + a] < -RANGE) {
                    velocities[ix + a] *= -1;
                }
            }
        }
        dotsGeo.attributes.position.needsUpdate = true;

        // Build connection lines
        let ptr = 0;
        for (let i = 0; i < POINTS; i++) {
            const ix = i * 3;
            const ax = positions[ix], ay = positions[ix + 1], az = positions[ix + 2];
            for (let j = i + 1; j < POINTS; j++) {
                const jx = j * 3;
                const bx = positions[jx], by = positions[jx + 1], bz = positions[jx + 2];

                const dx = ax - bx;
                const dy = ay - by;
                const dz = az - bz;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (dist < CONNECT_DIST) {
                    linePositions[ptr++] = ax;
                    linePositions[ptr++] = ay;
                    linePositions[ptr++] = az;
                    linePositions[ptr++] = bx;
                    linePositions[ptr++] = by;
                    linePositions[ptr++] = bz;
                }
            }
        }
        // Update only the used portion
        lineGeo.setDrawRange(0, ptr / 3);
        lineGeo.attributes.position.needsUpdate = true;

        // Slight rotation for depth
        scene.rotation.y += 0.0015;

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }

    animate();
})();

// Add keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        const soonModalEl = document.getElementById('soon-modal');
        if (soonModalEl) soonModalEl.classList.remove('active');
    }
});

// Performance optimization - Debounce scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Apply debouncing to scroll events
const debouncedScroll = debounce(() => {
    // Scroll-based animations here
}, 10);

window.addEventListener('scroll', debouncedScroll);

// Add loading animation
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 1s ease-in';
        document.body.style.opacity = '1';
    }, 100);
});

// Console Easter Egg
console.log('%c🎮 APOCALYPSE GAMES 🎮', 'font-size: 20px; color: #ff6b35; font-weight: bold; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);');
console.log('%cSURVIVE. ADAPT. CONQUER.', 'font-size: 14px; color: #f7931e; font-family: monospace;');
console.log('%cWelcome to the resistance, soldier!', 'font-size: 12px; color: #00ff41; font-family: monospace;');

// Countdown Timer for Gathering Phase (ends Oct 12, 2 PM UTC)
function startCountdown(elementId, targetUtcMs) {
    const el = document.getElementById(elementId);
    if (!el) return;

    function update() {
        const now = Date.now();
        let diff = targetUtcMs - now;

        if (diff <= 0) {
            el.textContent = 'Ended';
            el.classList.add('ended');
            clearInterval(timer);
            return;
        }

        const dayMs = 1000 * 60 * 60 * 24;
        const hourMs = 1000 * 60 * 60;
        const minuteMs = 1000 * 60;

        const days = Math.floor(diff / dayMs);
        diff %= dayMs;
        const hours = Math.floor(diff / hourMs);
        diff %= hourMs;
        const minutes = Math.floor(diff / minuteMs);
        diff %= minuteMs;
        const seconds = Math.floor(diff / 1000);

        el.textContent = `${days}d ${String(hours).padStart(2,'0')}h ${String(minutes).padStart(2,'0')}m ${String(seconds).padStart(2,'0')}s`;
    }

    update();
    const timer = setInterval(update, 1000);
}

// Initialize Gathering Phase countdown (2025-10-12 14:00:00 UTC)
startCountdown('gathering-countdown', Date.UTC(2025, 9, 12, 14, 0, 0));

// "SOON" Modal for Discord link
(function initSoonModal() {
    const discordLink = document.querySelector('.discord-link');
    const soonModal = document.getElementById('soon-modal');
    const soonClose = document.getElementById('soon-close');

    const openSoon = () => {
        if (soonModal) {
            soonModal.classList.add('active');
        }
    };

    const closeSoon = () => {
        if (soonModal) {
            soonModal.classList.remove('active');
        }
    };

    if (discordLink) {
        discordLink.addEventListener('click', (e) => {
            e.preventDefault();
            openSoon();
        });
    }

    if (soonClose) {
        soonClose.addEventListener('click', closeSoon);
    }

    if (soonModal) {
        // Close when clicking outside the modal card
        soonModal.addEventListener('click', (e) => {
            if (e.target === soonModal) {
                closeSoon();
            }
        });
    }
})();

/* Tokenomics Pie Chart (responsive donut, balanced proportions) */
(function initTokenomicsPie() {
    const canvas = document.getElementById('tokenomics-pie');
    const legend = document.getElementById('tokenomics-legend');
    if (!canvas || !canvas.getContext) return;

    const data = [
        { label: 'Reward Wallet', value: 8, color: '#ff6b35' },
        { label: 'Fair Launch', value: 92, color: '#f7931e' }
    ];
    const total = data.reduce((s, d) => s + d.value, 0);

    const ctx = canvas.getContext('2d');

    function draw() {
        const rect = canvas.getBoundingClientRect();
        const cssW = Math.max(260, Math.round(rect.width || 300));
        const cssH = cssW; // enforced square by CSS aspect-ratio

        const dpr = window.devicePixelRatio || 1;
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Clear
        ctx.clearRect(0, 0, cssW, cssH);

        const cx = cssW / 2;
        const cy = cssH / 2;
        const radius = Math.min(cssW, cssH) / 2 - 10;

        // Balanced ring thickness
        const innerRatio = 0.62; // 62% inner radius -> visually pleasing ring
        const ringWidth = radius * (1 - innerRatio);
        const rMid = radius - ringWidth / 2;

        // Draw segments as strokes for crisp ring
        let start = -Math.PI / 2;
        data.forEach(d => {
            const angle = (d.value / total) * Math.PI * 2;
            ctx.beginPath();
            ctx.lineWidth = ringWidth;
            ctx.lineCap = 'butt';
            ctx.strokeStyle = d.color;
            ctx.arc(cx, cy, rMid, start, start + angle);
            ctx.stroke();
            start += angle;
        });

        // Subtle inner/outer borders for definition
        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.arc(cx, cy, rMid + ringWidth / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, rMid - ringWidth / 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Build legend once
    if (legend) {
        legend.innerHTML = '';
        data.forEach(d => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="pie-swatch" style="background:${d.color}"></span>${d.label} — ${d.value}%`;
            legend.appendChild(li);
        });
    }

    // Initial draw and responsive redraws
    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    window.addEventListener('resize', () => draw());
})();
