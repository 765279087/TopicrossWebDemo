// Fireworks effect
const fireworksCanvas = document.getElementById('fireworks');
const ctx = fireworksCanvas.getContext('2d');
let fireworks = [];
let particles = [];
let animationId;

function resizeCanvas() {
  fireworksCanvas.width = window.innerWidth;
  fireworksCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Firework {
  constructor(x, y, targetX, targetY) {
    this.x = x;
    this.y = y;
    this.targetX = targetX;
    this.targetY = targetY;
    this.distanceToTarget = Math.hypot(targetX - x, targetY - y);
    this.distanceTraveled = 0;
    this.coordinates = [];
    this.coordinateCount = 3;
    while (this.coordinateCount--) {
      this.coordinates.push([this.x, this.y]);
    }
    this.angle = Math.atan2(targetY - y, targetX - x);
    this.speed = 2;
    this.acceleration = 1.05;
    this.brightness = Math.random() * 50 + 50;
  }

  update(index) {
    this.coordinates.pop();
    this.coordinates.unshift([this.x, this.y]);

    if (this.speed < 8) {
        this.speed *= this.acceleration;
    }

    const vx = Math.cos(this.angle) * this.speed;
    const vy = Math.sin(this.angle) * this.speed;
    this.distanceTraveled = Math.hypot(this.x + vx - this.x, this.y + vy - this.y) + this.distanceTraveled; // simplified

    // Actual distance check
    if (this.distanceTraveled >= this.distanceToTarget) {
      createParticles(this.targetX, this.targetY);
      fireworks.splice(index, 1);
    } else {
      this.x += vx;
      this.y += vy;
    }
  }

  draw() {
    ctx.beginPath();
    ctx.moveTo(this.coordinates[this.coordinates.length - 1][0], this.coordinates[this.coordinates.length - 1][1]);
    ctx.lineTo(this.x, this.y);
    ctx.strokeStyle = `hsl(${Math.random() * 360}, 100%, ${this.brightness}%)`;
    ctx.stroke();
  }
}

class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.coordinates = [];
    this.coordinateCount = 5;
    while (this.coordinateCount--) {
      this.coordinates.push([this.x, this.y]);
    }
    this.angle = Math.random() * Math.PI * 2;
    this.speed = Math.random() * 10 + 1;
    this.friction = 0.95;
    this.gravity = 1;
    this.hue = Math.random() * 360;
    this.brightness = Math.random() * 50 + 50;
    this.alpha = 1;
    this.decay = Math.random() * 0.015 + 0.015;
  }

  update(index) {
    this.coordinates.pop();
    this.coordinates.unshift([this.x, this.y]);
    this.speed *= this.friction;
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed + this.gravity;
    this.alpha -= this.decay;

    if (this.alpha <= this.decay) {
      particles.splice(index, 1);
    }
  }

  draw() {
    ctx.beginPath();
    ctx.moveTo(this.coordinates[this.coordinates.length - 1][0], this.coordinates[this.coordinates.length - 1][1]);
    ctx.lineTo(this.x, this.y);
    ctx.strokeStyle = `hsla(${this.hue}, 100%, ${this.brightness}%, ${this.alpha})`;
    ctx.stroke();
  }
}

function createParticles(x, y) {
  let particleCount = 30;
  while (particleCount--) {
    particles.push(new Particle(x, y));
  }
}

function loop() {
  if (!fireworks.length && !particles.length) {
     // Don't stop loop immediately to allow trailing effect, but here we can just continue
  }
  
  // Clear canvas with trail effect
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
  ctx.globalCompositeOperation = 'lighter';

  let i = fireworks.length;
  while (i--) {
    fireworks[i].draw();
    fireworks[i].update(i);
  }

  let j = particles.length;
  while (j--) {
    particles[j].draw();
    particles[j].update(j);
  }

  if (Math.random() < 0.05) { // Randomly launch fireworks
      const startX = Math.random() * fireworksCanvas.width;
      const targetX = Math.random() * fireworksCanvas.width;
      const targetY = Math.random() * (fireworksCanvas.height / 2);
      fireworks.push(new Firework(startX, fireworksCanvas.height, targetX, targetY));
  }

  animationId = requestAnimationFrame(loop);
}

function startFireworks() {
  if (animationId) return;
  loop();
}

function stopFireworks() {
  cancelAnimationFrame(animationId);
  animationId = null;
  fireworks = [];
  particles = [];
  ctx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
}

// Ensure updateBoardStatus is called when initializing
