require('dotenv').config();
require('./lib/assertLocalDb').assertLocalDb('create_test_user.js');
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/database');

(async () => {
  try {
    const email = 'user@gmail.com';
    const password = 'test@123';

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    let userId;
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
      console.log('User already exists, updated password. ID:', userId);
    } else {
      const result = await pool.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
        [email, hash, 'user']
      );
      userId = result.rows[0].id;
      console.log('User created. ID:', userId);
    }

    const plans = await pool.query('SELECT id, name, tier_level FROM subscription_plans ORDER BY tier_level');
    console.log('Available plans:', plans.rows.map(p => `${p.name} (tier ${p.tier_level})`).join(', '));

    const zeroToHero = plans.rows.find(p => p.tier_level === 3 || p.name.toLowerCase().includes('zero'));
    if (!zeroToHero) {
      console.error('Zero to Hero plan not found');
      process.exit(1);
    }

    await pool.query(
      'INSERT INTO user_subscriptions (user_id, plan_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET plan_id = $2',
      [userId, zeroToHero.id]
    );

    // Skip the signup survey / payment flow for this local test account.
    await pool.query('UPDATE users SET onboarding_completed = true WHERE id = $1', [userId]);

    const verify = await pool.query(
      'SELECT u.email, sp.name as plan_name, sp.tier_level FROM users u JOIN user_subscriptions us ON u.id = us.user_id JOIN subscription_plans sp ON us.plan_id = sp.id WHERE u.id = $1',
      [userId]
    );
    console.log('Done:', verify.rows[0]);

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
