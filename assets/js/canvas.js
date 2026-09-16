(function initInteractiveLightDnaCanvas() {
  const canvas = document.getElementById('ambient-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width, height;

  let mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000, hoverFactor: 0 };
  let scrollY = window.scrollY || 0;
  let targetScrollY = scrollY;
  let scrollVelocity = 0;
  let time = 0;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('mousemove', (e) => {
    mouse.targetX = e.clientX;
    mouse.targetY = e.clientY;
  });

  window.addEventListener('mouseleave', () => {
    mouse.targetX = -1000;
    mouse.targetY = -1000;
  });

  window.addEventListener('scroll', () => {
    targetScrollY = window.scrollY || window.pageYOffset;
  }, { passive: true });

  const totalPairs = 42;
  const baseSpacing = 28;
  const helixRadius = 78;
  const twistFreq = 0.058;

  const baseColors = [
    { primary: 'rgba(6, 182, 212, 0.85)', glow: 'rgba(6, 182, 212, 0.35)', core: '#0891b2' },
    { primary: 'rgba(79, 70, 229, 0.82)', glow: 'rgba(99, 102, 241, 0.32)', core: '#4338ca' },
    { primary: 'rgba(16, 185, 129, 0.85)', glow: 'rgba(52, 211, 153, 0.35)', core: '#059669' },
    { primary: 'rgba(245, 158, 11, 0.85)', glow: 'rgba(251, 191, 36, 0.35)', core: '#d97706' }
  ];

  function animate() {
    ctx.clearRect(0, 0, width, height);

    mouse.x += (mouse.targetX - mouse.x) * 0.12;
    mouse.y += (mouse.targetY - mouse.y) * 0.12;

    const dScroll = targetScrollY - scrollY;
    scrollVelocity = dScroll * 0.08;
    scrollY += scrollVelocity;
    time += 0.016 + Math.abs(scrollVelocity) * 0.003;

    const centerX = width > 1024 ? width * 0.86 : (width > 640 ? width * 0.90 : width * 0.94);
    const startY = (height / 2) - ((totalPairs * baseSpacing) / 2);
    const scrollWarp = (scrollY * 0.22) % (Math.PI * 2);

    const distToHelixCenter = Math.abs(mouse.x - centerX);
    const isHoveringNearHelix = distToHelixCenter < 220 && mouse.y >= 0 && mouse.y <= height;
    const targetHover = isHoveringNearHelix ? 1.0 : 0.0;
    mouse.hoverFactor += (targetHover - mouse.hoverFactor) * 0.08;

    const renderedNodes = [];

    for (let i = 0; i < totalPairs; i++) {
      const y = startY + (i * baseSpacing) + Math.sin(time * 1.5 + i * 0.1) * 8;
      const hoverTwistSpeed = mouse.hoverFactor * 0.35;
      const theta = (i * twistFreq * (1 + mouse.hoverFactor * 0.2)) + (time * 1.35) + scrollWarp + (i * hoverTwistSpeed);

      const dynamicRadius = helixRadius * (1 + mouse.hoverFactor * 0.28);
      const x1 = centerX + Math.cos(theta) * dynamicRadius;
      const z1 = Math.sin(theta);
      const x2 = centerX + Math.cos(theta + Math.PI) * dynamicRadius;
      const z2 = Math.sin(theta + Math.PI);

      const dist1 = Math.hypot(x1 - mouse.x, y - mouse.y);
      const dist2 = Math.hypot(x2 - mouse.x, y - mouse.y);

      let pushX1 = 0, pushY1 = 0, scale1 = 1;
      let pushX2 = 0, pushY2 = 0, scale2 = 1;

      if (dist1 < 140) {
        const force = (140 - dist1) / 140;
        pushX1 = ((x1 - mouse.x) / (dist1 || 1)) * force * 35;
        pushY1 = ((y - mouse.y) / (dist1 || 1)) * force * 35;
        scale1 = 1 + force * 0.85;
      }

      if (dist2 < 140) {
        const force = (140 - dist2) / 140;
        pushX2 = ((x2 - mouse.x) / (dist2 || 1)) * force * 35;
        pushY2 = ((y - mouse.y) / (dist2 || 1)) * force * 35;
        scale2 = 1 + force * 0.85;
      }

      const node1 = { x: x1 + pushX1, y: y + pushY1, z: z1, scale: scale1, pairIdx: i, strand: 0, distMouse: dist1 };
      const node2 = { x: x2 + pushX2, y: y + pushY2, z: z2, scale: scale2, pairIdx: i, strand: 1, distMouse: dist2 };

      const depthAlpha = 0.25 + ((z1 + 1) / 2) * 0.45;
      const rungHover = (dist1 < 140 || dist2 < 140) ? 0.9 : depthAlpha;
      const rungGrad = ctx.createLinearGradient(node1.x, node1.y, node2.x, node2.y);
      const colorPair1 = baseColors[i % baseColors.length];
      const colorPair2 = baseColors[(i + 2) % baseColors.length];

      rungGrad.addColorStop(0, colorPair1.primary.replace('0.85', `${rungHover}`));
      rungGrad.addColorStop(0.5, `rgba(226, 232, 240, ${rungHover * 0.6})`);
      rungGrad.addColorStop(1, colorPair2.primary.replace('0.85', `${rungHover}`));

      ctx.beginPath();
      ctx.moveTo(node1.x, node1.y);
      ctx.lineTo(node2.x, node2.y);
      ctx.strokeStyle = rungGrad;
      ctx.lineWidth = (1.4 + ((z1 + 1) / 2) * 1.8) * (node1.scale > 1.2 || node2.scale > 1.2 ? 1.6 : 1.0);
      ctx.lineCap = 'round';
      ctx.stroke();

      renderedNodes.push(node1, node2);
    }

    for (let s = 0; s < 2; s++) {
      const strandNodes = renderedNodes.filter(n => n.strand === s);
      ctx.beginPath();
      for (let i = 0; i < strandNodes.length - 1; i++) {
        const curr = strandNodes[i];
        const next = strandNodes[i + 1];
        const xc = (curr.x + next.x) / 2;
        const yc = (curr.y + next.y) / 2;
        if (i === 0) ctx.moveTo(curr.x, curr.y);
        ctx.quadraticCurveTo(curr.x, curr.y, xc, yc);
      }
      ctx.strokeStyle = s === 0 ? 'rgba(6, 182, 212, 0.32)' : 'rgba(79, 70, 229, 0.30)';
      ctx.lineWidth = 1.8 + mouse.hoverFactor * 1.0;
      ctx.stroke();
    }

    renderedNodes.sort((a, b) => a.z - b.z);

    renderedNodes.forEach(node => {
      const colorScheme = baseColors[(node.pairIdx + (node.strand * 2)) % baseColors.length];
      const depthMultiplier = (node.z + 1.2) / 2.2;
      const radius = Math.max(2.2, (3.8 * depthMultiplier + 1.2) * node.scale);
      const alpha = Math.min(1.0, 0.35 + depthMultiplier * 0.6 + (node.scale > 1.1 ? 0.3 : 0));

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius * (node.scale > 1.1 ? 2.5 : 1.8), 0, Math.PI * 2);
      ctx.fillStyle = colorScheme.glow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = colorScheme.primary.replace(/[\d\.]+\)$/, `${alpha})`);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x - radius * 0.32, node.y - radius * 0.32, radius * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
    });

    requestAnimationFrame(animate);
  }
  animate();
})();
