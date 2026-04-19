'use client';

import { useEffect, useRef } from 'react';

const VERT = `
attribute vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }
`;

const PRELUDE = `
precision highp float;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform vec2 u_target;
uniform float u_time;
uniform float u_click;
uniform vec2 u_clickPos;
uniform float u_vel;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.,0.));
  float c = hash(i+vec2(0.,1.)), d = hash(i+vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v = 0., a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
`;

const FRAG_LIQUID = PRELUDE + `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
  vec2 mp = (u_target - 0.5*u_res) / min(u_res.x, u_res.y);
  vec2 d = uv - mp;
  float r = length(d);
  float bulge = 0.18 / (r*r + 0.12);
  vec2 warped = uv - d * bulge * 0.06;
  float t = u_time * 0.07;
  vec2 p = warped * 1.6;
  p = rot(0.6 + sin(t)*0.15) * p;
  float n1 = fbm(p + vec2(t, -t*0.6));
  float n2 = fbm(p*1.7 + vec2(-t*0.8, t*0.4) + n1);
  float n3 = fbm(p*0.6 + n2*1.3);
  float v = n1*0.5 + n2*0.35 + n3*0.25;
  float bands = sin(v*14.0 + u_time*0.3) * 0.5 + 0.5;
  bands = smoothstep(0.25, 0.75, bands);
  vec2 cp = (u_clickPos - 0.5*u_res) / min(u_res.x, u_res.y);
  float cd = length(uv - cp);
  float ring = sin(cd*30.0 - u_time*4.0) * exp(-cd*4.0) * u_click;
  float shade = bands*0.7 + v*0.4 + ring*0.3;
  vec3 a = vec3(0.04, 0.05, 0.07);
  vec3 b = vec3(0.18, 0.22, 0.28);
  vec3 c = vec3(0.55, 0.60, 0.68);
  vec3 d1 = vec3(0.92, 0.94, 0.98);
  vec3 col = mix(a, b, smoothstep(0.0,0.4, shade));
  col = mix(col, c, smoothstep(0.4,0.75, shade));
  col = mix(col, d1, smoothstep(0.75,1.0, shade));
  col += vec3(0.02,0.08,0.12) * exp(-r*3.0) * 0.6;
  col *= 1.0 - length(uv)*0.35;
  gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_PLASMA = PRELUDE + `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
  vec2 mp = (u_target - 0.5*u_res) / min(u_res.x, u_res.y);
  float t = u_time * 0.35;
  vec2 p = uv * 2.2;
  vec2 q = vec2(fbm(p + t*0.2), fbm(p - t*0.15 + 3.1));
  vec2 r = vec2(fbm(p + q + vec2(1.7,9.2) + t*0.3),
                fbm(p + q + vec2(8.3,2.8) - t*0.2));
  float md = length(uv - mp);
  float heat = exp(-md*1.6) * (0.8 + 0.4*sin(u_time*2.0));
  r += (mp - uv) * heat * 0.5;
  float f = fbm(p + 2.0*r);
  vec2 cp = (u_clickPos - 0.5*u_res) / min(u_res.x, u_res.y);
  float cd = length(uv - cp);
  float flash = exp(-cd*3.0) * u_click * 1.2;
  f += heat*0.5 + flash;
  vec3 col;
  col  = mix(vec3(0.02,0.03,0.10), vec3(0.10,0.15,0.45), f);
  col  = mix(col, vec3(0.20,0.70,0.95), smoothstep(0.55, 0.85, f));
  col  = mix(col, vec3(0.95,0.98,1.00), smoothstep(0.88, 1.05, f));
  col += vec3(0.8,0.2,0.6) * heat * 0.25;
  col += (hash(gl_FragCoord.xy + u_time)-0.5) * 0.02;
  gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_VORONOI = PRELUDE + `
vec2 hash2(vec2 p){
  p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
  return fract(sin(p)*43758.5453);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
  vec2 mp = (u_target - 0.5*u_res) / min(u_res.x, u_res.y);
  float t = u_time * 0.18;
  vec2 d = uv - mp;
  float r = length(d);
  vec2 warp = uv - d * (0.4 / (r+0.3)) * 0.12;
  vec2 p = warp * 5.0;
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float f1 = 10.0, f2 = 10.0;
  vec2 nearest = vec2(0.);
  for(int y=-1; y<=1; y++){
    for(int x=-1; x<=1; x++){
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(ip + g);
      o = 0.5 + 0.5*sin(t + 6.28*o);
      vec2 pos = g + o - fp;
      float dist = length(pos);
      if(dist < f1){ f2 = f1; f1 = dist; nearest = ip+g; }
      else if(dist < f2){ f2 = dist; }
    }
  }
  float edge = f2 - f1;
  float cell = hash(nearest);
  vec2 cp = (u_clickPos - 0.5*u_res) / min(u_res.x, u_res.y);
  float cd = length(warp - cp);
  float ripple = smoothstep(0.02, 0.0, abs(cd - u_click*0.9)) * u_click;
  vec3 base = mix(vec3(0.05,0.06,0.12), vec3(0.18,0.22,0.45), cell);
  base = mix(base, vec3(0.60,0.45,0.85), pow(cell, 4.0));
  float hl = exp(-r*2.2);
  base += vec3(0.25,0.35,0.9) * hl * 0.4;
  float line = smoothstep(0.04, 0.0, edge);
  vec3 col = mix(base, vec3(0.95,0.97,1.0), line*0.85);
  col += vec3(1.0,0.7,0.95) * ripple * 0.8;
  col *= 1.0 - length(uv)*0.3;
  gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_GRID = PRELUDE + `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;
  vec2 mp = (u_target - 0.5*u_res) / u_res.y;
  vec3 col = vec3(0.0);
  float t = u_time * 0.6;
  float cam = mp.x * 0.4;
  if(uv.y < 0.05){
    float z = 1.0 / (-uv.y + 0.06);
    float x = (uv.x - cam*0.2) * z;
    float gx = abs(fract(x*1.2 - 0.5) - 0.5);
    float gy = abs(fract(z*0.5 - t) - 0.5);
    float line = min(gx, gy);
    float glow = smoothstep(0.06, 0.0, line) * (1.0/(1.0+z*0.15));
    vec3 neon = mix(vec3(1.0,0.15,0.5), vec3(0.1,0.6,1.0), smoothstep(-0.3,0.3, uv.x));
    col += neon * glow * 1.4;
    col *= smoothstep(0.06, -0.4, uv.y);
  } else {
    vec2 sp = uv - vec2(mp.x*0.2, 0.0);
    float sun = smoothstep(0.42, 0.0, length(sp - vec2(0.0, 0.28)));
    vec3 sunCol = mix(vec3(1.0,0.8,0.2), vec3(1.0,0.2,0.6), smoothstep(0.0, 0.4, sp.y));
    float band = step(0.5, fract((sp.y - 0.1)*14.0 - t*0.3));
    col += sunCol * sun * band;
  }
  float md = length(uv - mp);
  col += vec3(0.6, 0.3, 1.0) * exp(-md*5.0) * 0.5;
  vec2 cp = (u_clickPos - 0.5*u_res) / u_res.y;
  float cd = length(uv - cp);
  float wave = smoothstep(0.015, 0.0, abs(cd - u_click*1.1)) * u_click;
  col += vec3(1.0,1.0,1.0) * wave * 1.5;
  col += vec3(0.04, 0.02, 0.08) * (1.0 - length(uv)*0.4);
  col *= 0.95 + 0.05*sin(gl_FragCoord.y*2.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_AURORA = PRELUDE + `
float ribbon(vec2 p, float offset, float speed, float amp){
  float y = sin(p.x*1.8 + u_time*speed + offset) * amp
          + sin(p.x*0.7 - u_time*speed*0.6 + offset) * amp*0.6;
  return smoothstep(0.08, 0.0, abs(p.y - y));
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;
  vec2 mp = (u_target - 0.5*u_res) / u_res.y;
  float t = u_time * 0.2;
  vec2 p = uv;
  p += 0.3 * vec2(fbm(p*1.5 + t + mp*0.5),
                  fbm(p*1.5 - t + mp*0.5 + 4.0));
  float pull = (mp.y - p.y) * 0.6 * exp(-abs(p.x - mp.x)*1.2);
  p.y += pull;
  vec3 col = vec3(0.02, 0.03, 0.07);
  float r1 = ribbon(vec2(p.x, p.y+0.05), 0.0, 0.6, 0.18);
  float r2 = ribbon(vec2(p.x, p.y-0.08), 2.1, 0.45, 0.22);
  float r3 = ribbon(vec2(p.x, p.y-0.2),  4.2, 0.35, 0.16);
  col += vec3(0.20, 0.95, 0.70) * r1;
  col += vec3(0.40, 0.55, 1.00) * r2;
  col += vec3(0.95, 0.45, 0.85) * r3;
  col += vec3(0.05,0.1,0.15) * fbm(p*3.0 + t);
  vec2 sp = floor(uv*200.0);
  float star = step(0.997, hash(sp)) * (0.5+0.5*sin(u_time*3.0 + hash(sp)*20.0));
  col += vec3(1.0) * star * 0.6;
  vec2 cp = (u_clickPos - 0.5*u_res) / u_res.y;
  float cd = length(uv - cp);
  col += vec3(1.0, 0.9, 1.0) * exp(-cd*4.0) * u_click * 0.8;
  col += vec3(0.6, 1.0, 0.9) * smoothstep(0.02, 0.0, abs(cd - u_click*0.8)) * u_click;
  float md = length(uv - mp);
  col += vec3(0.3, 0.7, 0.9) * exp(-md*6.0) * 0.25;
  col *= 1.0 - length(uv)*0.3;
  gl_FragColor = vec4(col, 1.0);
}
`;

const SHADERS = [FRAG_LIQUID, FRAG_PLASMA, FRAG_VORONOI, FRAG_GRID, FRAG_AURORA];

// Accent colors chosen to pop against each shader's dominant palette.
// Indices align with SHADERS above.
export const SHADER_ACCENTS = [
  '#fb923c', // Liquid Metal — warm orange against graphite/platinum
  '#fbbf24', // Plasma Field — amber against deep blue/cyan
  '#84cc16', // Voronoi Cells — lime against indigo/violet
  '#fde047', // Neon Grid — yellow against retrowave pink/blue
  '#fb7185', // Aurora Silk — rose against cool mint/periwinkle
] as const;

const STORAGE_KEY = 'jarvis:login-shader-idx';

function pickShaderIndex(): number {
  if (typeof window === 'undefined') return 0;
  const lastRaw = window.sessionStorage.getItem(STORAGE_KEY);
  const last = lastRaw === null ? NaN : Number(lastRaw);
  let next = Math.floor(Math.random() * SHADERS.length);
  if (!Number.isNaN(last) && SHADERS.length > 1 && next === last) {
    next = (next + 1) % SHADERS.length;
  }
  window.sessionStorage.setItem(STORAGE_KEY, String(next));
  return next;
}

type ShaderBackgroundProps = {
  onIndexPicked?: (index: number) => void;
};

export function ShaderBackground({ onIndexPicked }: ShaderBackgroundProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onIndexPickedRef = useRef(onIndexPicked);
  onIndexPickedRef.current = onIndexPicked;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return;

    const shaderIndex = pickShaderIndex();
    onIndexPickedRef.current?.(shaderIndex);
    const fragSrc = SHADERS[shaderIndex] ?? SHADERS[0]!;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const aLoc = gl.getAttribLocation(program, 'a');
    const uRes = gl.getUniformLocation(program, 'u_res');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');
    const uTarget = gl.getUniformLocation(program, 'u_target');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uClick = gl.getUniformLocation(program, 'u_click');
    const uClickPos = gl.getUniformLocation(program, 'u_clickPos');
    const uVel = gl.getUniformLocation(program, 'u_vel');

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const target = { x: mouse.x, y: mouse.y };
    const prev = { x: mouse.x, y: mouse.y };
    const clickPos = { x: mouse.x, y: mouse.y };
    let vel = 0;
    let clickAmt = 0;

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = window.innerHeight - e.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      mouse.x = t.clientX;
      mouse.y = window.innerHeight - t.clientY;
    };
    const onDown = (e: MouseEvent) => {
      clickAmt = 1.0;
      clickPos.x = e.clientX;
      clickPos.y = window.innerHeight - e.clientY;
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      clickAmt = 1.0;
      clickPos.x = t.clientX;
      clickPos.y = window.innerHeight - t.clientY;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('mousedown', onDown);
    window.addEventListener('touchstart', onTouchStart, { passive: true });

    let rafId = 0;
    let disposed = false;
    const t0 = performance.now();

    const frame = () => {
      if (disposed) return;
      const now = performance.now();
      const t = (now - t0) / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      target.x += (mouse.x - target.x) * 0.08;
      target.y += (mouse.y - target.y) * 0.08;
      const dx = mouse.x - prev.x;
      const dy = mouse.y - prev.y;
      vel = vel * 0.85 + Math.hypot(dx, dy) * 0.15;
      prev.x = mouse.x;
      prev.y = mouse.y;

      clickAmt *= 0.965;
      if (clickAmt < 0.001) clickAmt = 0;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aLoc);
      gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouse.x * dpr, mouse.y * dpr);
      gl.uniform2f(uTarget, target.x * dpr, target.y * dpr);
      gl.uniform2f(uClickPos, clickPos.x * dpr, clickPos.y * dpr);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uClick, clickAmt);
      gl.uniform1f(uVel, vel);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('touchstart', onTouchStart);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 h-screen w-screen"
      style={{ zIndex: 0, background: '#0b0d10' }}
    />
  );
}
