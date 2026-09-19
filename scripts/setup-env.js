// Creates backend/.env from backend/.env.example if it doesn't exist, generating a
// JWT_SECRET (the server refuses to start without one >= 32 chars).
// Never overwrites an existing .env.
//
// Usage: node scripts/setup-env.js   (also run by `npm run setup`)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const backendDir = path.join(__dirname, '..', 'backend');
const envPath = path.join(backendDir, '.env');
const examplePath = path.join(backendDir, '.env.example');

if (fs.existsSync(envPath)) {
  console.log('backend/.env already exists - leaving it untouched.');
  process.exit(0);
}

const example = fs.readFileSync(examplePath, 'utf-8');
const secret = crypto.randomBytes(64).toString('hex');
const env = example.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);

fs.writeFileSync(envPath, env);
console.log('Created backend/.env with a generated JWT_SECRET.');
console.log('Frontend needs no .env for local dev (see frontend/.env.example).');
