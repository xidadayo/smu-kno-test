import { spawn } from 'node:child_process';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: '3999', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await wait(1200);
  const health = await fetch('http://localhost:3999/api/health').then((res) => res.json());
  const summary = await fetch('http://localhost:3999/api/summary').then((res) => res.json());
  const login = await fetch('http://localhost:3999/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'admin', password: 'admin123' })
  }).then((res) => res.json());
  if (health.status !== 'ok') throw new Error('health check failed');
  if (!summary.learners || !summary.workflow) throw new Error('summary payload incomplete');
  if (login.user?.account !== 'admin') throw new Error('login check failed');
  console.log('smoke test passed');
} finally {
  server.kill();
}
